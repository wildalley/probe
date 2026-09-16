package agent

import (
	"context"
	"fmt"
	"log"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"

	"probe/pkg/model"
	"probe/pkg/netguard"
)

// TargetConfig defines a ping monitoring target.
type TargetConfig struct {
	ID       int64
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
	stats   map[targetKey]*targetState
}

type targetKey struct {
	id       int64
	label    string
	address  string
	protocol string
}

func keyForTarget(t TargetConfig) targetKey {
	if t.ID > 0 {
		return targetKey{id: t.ID}
	}
	return targetKey{label: t.Label, address: t.Address, protocol: strings.ToLower(t.Protocol)}
}

// lossWindow is how many recent probes the packet loss rate is computed over.
const lossWindow = 100

type targetState struct {
	label     string
	address   string
	color     string
	protocol  string
	interval  int
	lastProbe time.Time
	latencyMs float64
	jitter    float64
	probing   bool

	// Ring buffer of the last `lossWindow` probe outcomes (true = lost), with a
	// running count so the rate is O(1) to read. A real sliding window replaces
	// the earlier rescale-on-overflow scheme, which used integer division and so
	// silently rounded a handful of losses down to zero.
	lost         [lossWindow]bool
	lostIdx      int
	lostFilled   int
	lostInWindow int
}

// NewPinger initializes a latency & packet loss testing engine.
func NewPinger(targets []TargetConfig) *Pinger {
	if len(targets) == 0 {
		targets = DefaultTargets
	}
	p := &Pinger{
		targets: targets,
		stats:   make(map[targetKey]*targetState),
	}
	for _, t := range targets {
		p.stats[keyForTarget(t)] = &targetState{
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
	p.mu.Lock()
	defer p.mu.Unlock()

	p.targets = append([]TargetConfig(nil), targets...)
	active := make(map[targetKey]struct{}, len(targets))
	for _, t := range targets {
		key := keyForTarget(t)
		active[key] = struct{}{}
		if st, exists := p.stats[key]; !exists {
			p.stats[key] = &targetState{
				label:    t.Label,
				address:  t.Address,
				color:    t.Color,
				protocol: t.Protocol,
				interval: t.Interval,
			}
		} else if st.address != t.Address || !strings.EqualFold(st.protocol, t.Protocol) {
			// A label can be reused for a different destination. Its old loss
			// window and latency cannot describe the new destination.
			p.stats[key] = &targetState{
				label: t.Label, address: t.Address, color: t.Color,
				protocol: t.Protocol, interval: t.Interval,
			}
		} else {
			st.address = t.Address
			st.color = t.Color
			st.protocol = t.Protocol
			st.interval = t.Interval
		}
	}
	for key := range p.stats {
		if _, ok := active[key]; !ok {
			delete(p.stats, key)
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
		st, exists := p.stats[keyForTarget(target)]
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

	// Targets arrive from the server, but the server takes them from operator
	// input, so they are vetted again here. The agent is the process that holds
	// the credentials and the LAN position; a target that slipped past the
	// dashboard should not become a probe from inside every node's network.
	protocol := strings.ToLower(strings.TrimSpace(t.Protocol))
	if protocol == "http" {
		url := strings.TrimSpace(t.Address)
		validationErr := netguard.ValidatePingTarget("http", url, 0)
		if !strings.HasPrefix(strings.ToLower(url), "http://") && !strings.HasPrefix(strings.ToLower(url), "https://") {
			url = "https://" + url
		}
		if validationErr != nil {
			log.Printf("[Pinger] refusing target %s: %v", t.Label, validationErr)
		} else {
			client := netguard.NewGuardedProbeHTTPClient(timeout)
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
		}
	} else {
		// TCP or ICMP fallback dial. ValidateProbeTarget also normalises a bare
		// host or IPv6 literal into a dialable host:port.
		addr, err := netguard.ValidateProbeTarget(t.Address, 443)
		if err != nil {
			log.Printf("[Pinger] refusing target %s: %v", t.Label, err)
		} else {
			ctx, cancel := context.WithTimeout(context.Background(), timeout)
			conn, err := netguard.DialGuarded(ctx, addr, timeout)
			cancel()
			if err == nil {
				_ = conn.Close()
				latency = float64(time.Since(start).Microseconds()) / 1000.0
				success = true
			}
		}
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	st, exists := p.stats[keyForTarget(t)]
	if !exists || st.address != t.Address || !strings.EqualFold(st.protocol, t.Protocol) {
		return
	}
	st.probing = false
	st.lastProbe = time.Now()

	// Slide the window: drop the outcome leaving the buffer, record the new one.
	if st.lostFilled == lossWindow && st.lost[st.lostIdx] {
		st.lostInWindow--
	}
	st.lost[st.lostIdx] = !success
	if !success {
		st.lostInWindow++
	}
	st.lostIdx = (st.lostIdx + 1) % lossWindow
	if st.lostFilled < lossWindow {
		st.lostFilled++
	}

	if success {
		rounded := math.Round(latency*100) / 100
		// Compare against the previous successful probe. Reading st.latencyMs
		// before overwriting it keeps this to consecutive samples.
		if st.latencyMs > 0 {
			st.jitter = math.Abs(rounded - st.latencyMs)
		}
		st.latencyMs = rounded
	}
}

// GetStats returns the current snapshot of all target latency and loss stats.
func (p *Pinger) GetStats() []model.PingStat {
	p.mu.RLock()
	defer p.mu.RUnlock()

	res := make([]model.PingStat, 0, len(p.targets))
	labelCounts := make(map[string]int, len(p.targets))
	for _, t := range p.targets {
		labelCounts[t.Label]++
	}
	for _, t := range p.targets {
		st, exists := p.stats[keyForTarget(t)]
		if !exists {
			continue
		}

		lossRate := 0.0
		if st.lostFilled > 0 {
			lossRate = math.Round((float64(st.lostInWindow)/float64(st.lostFilled)*100)*100) / 100
		}

		label := t.Label
		if labelCounts[label] > 1 {
			if t.ID > 0 {
				label = fmt.Sprintf("%s (#%d)", label, t.ID)
			} else {
				label = fmt.Sprintf("%s (%s)", label, t.Address)
			}
		}
		res = append(res, model.PingStat{
			ID:         t.ID,
			Target:     t.Address,
			Label:      label,
			Color:      t.Color,
			LatencyMs:  st.latencyMs,
			PacketLoss: lossRate,
			Jitter:     math.Round(st.jitter*100) / 100,
		})
	}
	return res
}
