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
	// probes holds every distinct probe result seen during the bucket, each
	// stamped with the time it was actually taken.
	probes []*model.PingHistoryPoint
	// legacyPings is the last snapshot from agents that do not report
	// probed_at; their probes cannot be told apart, so one row per flush is
	// the best that can be stored.
	legacyPings  []model.PingStat
	lastReportTs int64
}

// Downsampler handles layered time-series downsampling to protect disk I/O.
type Downsampler struct {
	storage       *Storage
	mu            sync.Mutex
	buckets       map[string]*nodeBucket
	flushInterval time.Duration
	retentionDays int
	// lastProbed remembers, per node and target, the probed_at already
	// recorded. Agents repeat the latest probe in every 1Hz report, so this is
	// what keeps one probe from becoming one row per flush.
	lastProbed map[string]map[string]int64
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
		lastProbed:    make(map[string]map[string]int64),
		flushInterval: flushInterval,
		retentionDays: retentionDays,
	}
}

// maxAgentClockSkew is how far an agent's clock may drift from the server's
// before its timestamps are re-based onto the server clock.
const maxAgentClockSkew = 5 * 60

// clockOffset returns the seconds to add to an agent timestamp so it lands on
// the server clock. Small drift is kept as-is so probe times stay exact; a
// large one (dead NTP on a VPS) would otherwise file history in the future or
// past, where range queries miss it and retention purges it early.
func clockOffset(agentTs, now int64) int64 {
	if agentTs <= 0 {
		return 0
	}
	if diff := now - agentTs; diff > maxAgentClockSkew || diff < -maxAgentClockSkew {
		return diff
	}
	return 0
}

// RecordIngest adds a live report to the in-memory downsampling bucket.
func (d *Downsampler) RecordIngest(report *model.NodeReport) {
	d.mu.Lock()
	defer d.mu.Unlock()

	offset := clockOffset(report.Timestamp, time.Now().Unix())

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
	if report.Timestamp > 0 {
		b.lastReportTs = report.Timestamp + offset
	}

	seen := d.lastProbed[report.NodeID]
	if seen == nil {
		seen = make(map[string]int64)
		d.lastProbed[report.NodeID] = seen
	}
	var legacy []model.PingStat
	for _, p := range report.Pings {
		if p.ProbedAt <= 0 {
			// Nothing probed yet reports zero latency and no loss; storing it
			// would chart a fake 0 ms sample.
			if p.LatencyMs > 0 || p.Lost {
				legacy = append(legacy, p)
			}
			continue
		}
		key := p.Target + "\x00" + p.Label
		if seen[key] == p.ProbedAt {
			continue
		}
		seen[key] = p.ProbedAt
		b.probes = append(b.probes, &model.PingHistoryPoint{
			NodeID:     report.NodeID,
			Timestamp:  p.ProbedAt + offset,
			Target:     p.Target,
			Label:      p.Label,
			LatencyMs:  p.LatencyMs,
			PacketLoss: p.PacketLoss,
			LostEvent:  p.Lost,
		})
	}
	b.legacyPings = legacy
}

// ForgetNode drops the per-node probe bookkeeping once a node is deleted.
func (d *Downsampler) ForgetNode(nodeID string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	delete(d.lastProbed, nodeID)
	delete(d.buckets, nodeID)
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

		pingBatch = append(pingBatch, b.probes...)
		for _, p := range b.legacyPings {
			pingBatch = append(pingBatch, &model.PingHistoryPoint{
				NodeID:     nodeID,
				Timestamp:  ts,
				Target:     p.Target,
				Label:      p.Label,
				LatencyMs:  p.LatencyMs,
				PacketLoss: p.PacketLoss,
				LostEvent:  p.Lost,
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
