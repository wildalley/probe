package agent

import (
	"regexp"
	"strings"
	"sync"
	"time"
)

// Virtual interface regex patterns to exclude according to PDF Section 3.2:
// 剔除 lo (本地环回), docker0, veth* 等容器虚拟接口，仅汇总物理出口网卡 (如 eth0, ens3) 流量。
var virtualInterfacePatterns = []*regexp.Regexp{
	regexp.MustCompile(`^lo(\d+)?$`),
	regexp.MustCompile(`^docker\d*$`),
	regexp.MustCompile(`^veth.*$`),
	regexp.MustCompile(`^br-[a-f0-9]+$`),
	regexp.MustCompile(`^virbr\d*.*$`),
	regexp.MustCompile(`^bridge\d*$`),
	regexp.MustCompile(`^cni\d*$`),
	regexp.MustCompile(`^flannel\.\d*$`),
	regexp.MustCompile(`^cali.*$`),
	regexp.MustCompile(`^kube-.*$`),
	regexp.MustCompile(`^dummy\d*$`),
	regexp.MustCompile(`^tun\d*$`),
	regexp.MustCompile(`^tap\d*$`),
}

// IsPhysicalInterface returns true if the interface should be counted as a physical/egress interface.
func IsPhysicalInterface(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	for _, pat := range virtualInterfacePatterns {
		if pat.MatchString(lower) {
			return false
		}
	}
	return true
}

// RateTracker implements the differential rate calculation and counter rollover handling.
type RateTracker struct {
	mu            sync.Mutex
	lastSent      uint64
	lastRecv      uint64
	lastTime      time.Time
	hasBaseline   bool
	rateDownload  float64
	rateUpload    float64
}

// NewRateTracker creates a new differential network rate tracker.
func NewRateTracker() *RateTracker {
	return &RateTracker{}
}

// Update calculates the download and upload rates based on current cumulative bytes.
// Handles integer rollover / counter resets (when server reboots or 32-bit counter rolls over, ΔBytes < 0).
func (rt *RateTracker) Update(currSent, currRecv uint64, now time.Time) (rateDown, rateUp float64) {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	if !rt.hasBaseline {
		rt.lastSent = currSent
		rt.lastRecv = currRecv
		rt.lastTime = now
		rt.hasBaseline = true
		rt.rateDownload = 0
		rt.rateUpload = 0
		return 0, 0
	}

	dt := now.Sub(rt.lastTime).Seconds()
	if dt <= 0 {
		return rt.rateDownload, rt.rateUpload
	}

	// Check for reboot or 32-bit/64-bit counter rollover
	var deltaSent, deltaRecv uint64

	if currSent >= rt.lastSent {
		deltaSent = currSent - rt.lastSent
	} else {
		// Counter reset or rollover occurred: discard instantaneous spike and reset baseline
		deltaSent = 0
	}

	if currRecv >= rt.lastRecv {
		deltaRecv = currRecv - rt.lastRecv
	} else {
		// Counter reset or rollover occurred
		deltaRecv = 0
	}

	rt.rateDownload = float64(deltaRecv) / dt
	rt.rateUpload = float64(deltaSent) / dt

	// Update baseline
	rt.lastSent = currSent
	rt.lastRecv = currRecv
	rt.lastTime = now

	return rt.rateDownload, rt.rateUpload
}
