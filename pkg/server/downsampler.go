package server

import (
	"context"
	"log"
	"math"
	"sync"
	"time"

	"probe/pkg/model"
)

type nodeBucket struct {
	count        int
	cpuSum       float64
	loadSum      float64
	memUsedSum   uint64
	memTotal     uint64
	swapUsedSum  uint64
	swapTotal    uint64
	diskUsed     uint64
	diskTotal    uint64
	rateDownSum  float64
	rateUpSum    float64
	tcpCount     int
	udpCount     int
	processCount int
	lastPings    []model.PingStat
	lastReportTs int64
}

// Downsampler handles layered time-series downsampling to protect disk I/O.
type Downsampler struct {
	storage       *Storage
	mu            sync.Mutex
	buckets       map[string]*nodeBucket
	flushInterval time.Duration
	retentionDays int
}

// NewDownsampler creates a new downsampling engine.
func NewDownsampler(storage *Storage, flushInterval time.Duration, retentionDays int) *Downsampler {
	if flushInterval <= 0 {
		flushInterval = 15 * time.Second
	}
	if retentionDays <= 0 {
		retentionDays = 7
	}
	return &Downsampler{
		storage:       storage,
		buckets:       make(map[string]*nodeBucket),
		flushInterval: flushInterval,
		retentionDays: retentionDays,
	}
}

// RecordIngest adds a live report to the in-memory downsampling bucket.
func (d *Downsampler) RecordIngest(report *model.NodeReport) {
	d.mu.Lock()
	defer d.mu.Unlock()

	b, exists := d.buckets[report.NodeID]
	if !exists {
		b = &nodeBucket{
			memTotal:  report.System.MemTotal,
			swapTotal: report.System.SwapTotal,
			diskTotal: report.System.DiskTotal,
		}
		d.buckets[report.NodeID] = b
	}

	b.count++
	b.cpuSum += report.System.CPUPercent
	b.loadSum += report.System.Load1
	b.memUsedSum += report.System.MemUsed
	if report.System.MemTotal > 0 {
		b.memTotal = report.System.MemTotal
	}
	b.swapUsedSum += report.System.SwapUsed
	if report.System.SwapTotal > 0 {
		b.swapTotal = report.System.SwapTotal
	}
	b.diskUsed = report.System.DiskUsed
	b.diskTotal = report.System.DiskTotal

	b.rateDownSum += report.Network.RateDownload
	b.rateUpSum += report.Network.RateUpload
	b.tcpCount = report.Network.TCPEstablished
	b.udpCount = report.Network.UDPEstablished
	b.processCount = report.System.ProcessCount
	b.lastPings = report.Pings
	b.lastReportTs = report.Timestamp
}

// Start runs background flush and retention loops.
func (d *Downsampler) Start(ctx context.Context) {
	flushTicker := time.NewTicker(d.flushInterval)
	pruneTicker := time.NewTicker(6 * time.Hour)

	defer flushTicker.Stop()
	defer pruneTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			d.flush()
			return
		case <-flushTicker.C:
			d.flush()
		case <-pruneTicker.C:
			cutoff := time.Now().AddDate(0, 0, -d.retentionDays).Unix()
			pruned, err := d.storage.PruneOldHistory(cutoff)
			if err != nil {
				log.Printf("[Downsampler] Prune error: %v", err)
			} else if pruned > 0 {
				log.Printf("[Downsampler] Pruned %d aged history records (>%d days)", pruned, d.retentionDays)
			}
		}
	}
}

func (d *Downsampler) flush() {
	d.mu.Lock()
	if len(d.buckets) == 0 {
		d.mu.Unlock()
		return
	}

	currentBuckets := d.buckets
	d.buckets = make(map[string]*nodeBucket)
	d.mu.Unlock()

	var historyBatch []*model.HistoryPoint
	var pingBatch []*model.PingHistoryPoint
	now := time.Now().Unix()

	for nodeID, b := range currentBuckets {
		if b.count == 0 {
			continue
		}

		c := float64(b.count)
		avgCpu := math.Round((b.cpuSum/c)*10) / 10
		avgLoad := math.Round((b.loadSum/c)*100) / 100
		avgMemUsed := uint64(float64(b.memUsedSum) / c)
		avgSwapUsed := uint64(float64(b.swapUsedSum) / c)
		avgRateDown := math.Round((b.rateDownSum/c)*100) / 100
		avgRateUp := math.Round((b.rateUpSum/c)*100) / 100

		ts := b.lastReportTs
		if ts <= 0 {
			ts = now
		}

		historyBatch = append(historyBatch, &model.HistoryPoint{
			NodeID:       nodeID,
			Timestamp:    ts,
			CPUPercent:   avgCpu,
			Load1:        avgLoad,
			MemUsed:      avgMemUsed,
			MemTotal:     b.memTotal,
			SwapUsed:     avgSwapUsed,
			SwapTotal:    b.swapTotal,
			DiskUsed:     b.diskUsed,
			DiskTotal:    b.diskTotal,
			RateDownload: avgRateDown,
			RateUpload:   avgRateUp,
			TCPCount:     b.tcpCount,
			UDPCount:     b.udpCount,
			ProcessCount: b.processCount,
		})

		for _, p := range b.lastPings {
			pingBatch = append(pingBatch, &model.PingHistoryPoint{
				NodeID:     nodeID,
				Timestamp:  ts,
				Target:     p.Target,
				Label:      p.Label,
				LatencyMs:  p.LatencyMs,
				PacketLoss: p.PacketLoss,
			})
		}
	}

	if len(historyBatch) > 0 {
		if err := d.storage.InsertHistoryBatch(historyBatch); err != nil {
			log.Printf("[Downsampler] Batch insert history error: %v", err)
		}
	}
	if len(pingBatch) > 0 {
		if err := d.storage.InsertPingBatch(pingBatch); err != nil {
			log.Printf("[Downsampler] Batch insert ping error: %v", err)
		}
	}
}
