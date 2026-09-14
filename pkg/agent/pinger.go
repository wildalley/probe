package agent

import (
	"context"
	"math"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"probe/pkg/model"
)

// TargetConfig defines a ping monitoring target.
type TargetConfig struct {
	Label    string
	Address  string // host:port or url
	Color    string
	Protocol string // "tcp", "icmp", "http"
	Interval int    // seconds (e.g. 60)
}

// DefaultTargets includes the standard targets:
// Google, 电信, Youtube, ChatGPT, Claude
var DefaultTargets = []TargetConfig{
	{Label: "Google", Address: "8.8.8.8:53", Color: "#ef4444", Protocol: "tcp", Interval: 60},
	{Label: "电信", Address: "223.5.5.5:53", Color: "#06b6d4", Protocol: "tcp", Interval: 60},
	{Label: "Youtube", Address: "www.youtube.com:443", Color: "#a855f7", Protocol: "tcp", Interval: 60},
	{Label: "ChatGPT", Address: "api.openai.com:443", Color: "#3b82f6", Protocol: "tcp", Interval: 60},
	{Label: "Claude", Address: "api.anthropic.com:443", Color: "#f97316", Protocol: "tcp", Interval: 60},
}

// Pinger runs background latency and packet loss probes to monitored targets on interval schedules.
type Pinger struct {
	mu      sync.RWMutex
	targets []TargetConfig
	stats   map[string]*targetState
}

type targetState struct {
	label      string
	address    string
	color      string
	protocol   string
	interval   int
	lastProbe  time.Time
	latencyMs  float64
	lastLatMs  float64
	jitter     float64
	totalPings int
	lostPings  int
	probing    bool
}

// NewPinger initializes a latency & packet loss testing engine.
func NewPinger(targets []TargetConfig) *Pinger {
	if len(targets) == 0 {
		targets = DefaultTargets
	}
	p := &Pinger{
		targets: targets,
		stats:   make(map[string]*targetState),
	}
	for _, t := range targets {
		p.stats[t.Label] = &targetState{
			label:    t.Label,
			address:  t.Address,
			color:    t.Color,
			protocol: t.Protocol,
			interval: t.Interval,
		}
	}
	return p
}

// UpdateTargets safely replaces current monitored targets.
func (p *Pinger) UpdateTargets(targets []TargetConfig) {
	if len(targets) == 0 {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()

	p.targets = targets
	for _, t := range targets {
		if st, exists := p.stats[t.Label]; !exists {
			p.stats[t.Label] = &targetState{
				label:    t.Label,
				address:  t.Address,
				color:    t.Color,
				protocol: t.Protocol,
				interval: t.Interval,
			}
		} else {
			st.address = t.Address
			st.color = t.Color
			st.protocol = t.Protocol
			st.interval = t.Interval
		}
	}
}

// Start runs background probing loop checking schedules every second.
func (p *Pinger) Start(ctx context.Context) {
	// Initial immediate probe
	p.probeDueTargets(true)

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.probeDueTargets(false)
		}
	}
}

func (p *Pinger) probeDueTargets(force bool) {
	p.mu.Lock()
	now := time.Now()
	var dueTargets []TargetConfig

	for _, target := range p.targets {
		st, exists := p.stats[target.Label]
		if !exists {
			continue
		}
		intervalSec := target.Interval
		if intervalSec <= 0 {
			intervalSec = 60
		}

		if force || st.lastProbe.IsZero() || now.Sub(st.lastProbe) >= time.Duration(intervalSec)*time.Second {
			if !st.probing {
				st.probing = true
				dueTargets = append(dueTargets, target)
			}
		}
	}
	p.mu.Unlock()

	for _, target := range dueTargets {
		go p.probeOne(target)
	}
}

func (p *Pinger) probeOne(t TargetConfig) {
	timeout := 2500 * time.Millisecond
	start := time.Now()
	success := false
	latency := 0.0

	protocol := strings.ToLower(t.Protocol)
	if protocol == "http" {
		client := &http.Client{Timeout: timeout}
		url := t.Address
		if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
			url = "https://" + url
		}
		req, err := http.NewRequest("HEAD", url, nil)
		if err == nil {
			req.Header.Set("User-Agent", "CyberProbe/2.0")
			resp, err2 := client.Do(req)
			if err2 == nil {
				_ = resp.Body.Close()
				success = true
				latency = float64(time.Since(start).Microseconds()) / 1000.0
			}
		}
	} else {
		// TCP or ICMP fallback dial
		addr := t.Address
		if !strings.Contains(addr, ":") {
			addr = net.JoinHostPort(addr, "443")
		}
		conn, err := net.DialTimeout("tcp", addr, timeout)
		if err == nil {
			_ = conn.Close()
			latency = float64(time.Since(start).Microseconds()) / 1000.0
			success = true
		}
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	st, exists := p.stats[t.Label]
	if !exists {
		return
	}
	st.probing = false
	st.lastProbe = time.Now()

	st.totalPings++
	if !success {
		st.lostPings++
	} else {
		if st.lastLatMs > 0 {
			st.jitter = math.Abs(latency - st.lastLatMs)
		}
		st.lastLatMs = st.latencyMs
		st.latencyMs = math.Round(latency*100) / 100
	}

	// Rolling window reset
	if st.totalPings >= 100 {
		st.totalPings = 20
		st.lostPings = (st.lostPings * 20) / 100
	}
}

// GetStats returns the current snapshot of all target latency and loss stats.
func (p *Pinger) GetStats() []model.PingStat {
	p.mu.RLock()
	defer p.mu.RUnlock()

	res := make([]model.PingStat, 0, len(p.targets))
	for _, t := range p.targets {
		st, exists := p.stats[t.Label]
		if !exists {
			continue
		}

		lossRate := 0.0
		if st.totalPings > 0 {
			lossRate = math.Round((float64(st.lostPings)/float64(st.totalPings)*100)*100) / 100
		}

		res = append(res, model.PingStat{
			Target:     t.Address,
			Label:      t.Label,
			Color:      t.Color,
			LatencyMs:  st.latencyMs,
			PacketLoss: lossRate,
			Jitter:     math.Round(st.jitter*100) / 100,
		})
	}
	return res
}
