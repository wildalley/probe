package agent

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"probe/pkg/model"
	"probe/pkg/version"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	psnet "github.com/shirou/gopsutil/v4/net"
)

// Collector handles system, hardware, network, and ping telemetry collection.
type Collector struct {
	nodeID         string
	name           string
	token          string
	regionMu       sync.RWMutex
	region         string
	publicIP       string
	publicIPv6     string
	rateTracker    *RateTracker
	pinger         *Pinger
	pingerCancel   context.CancelFunc
	cpuModel       string
	virtualization string
	maxRateDown    float64
	maxRateUp      float64
}

// ipLookupTimeout bounds each individual lookup. Detection runs in the
// background, so a slow endpoint delays the first report's IP, not the report.
const ipLookupTimeout = 2 * time.Second

// ipRefreshInterval is how often the egress address is re-checked. A VPS that
// is rebuilt or re-homed keeps its node ID, so a one-shot lookup at startup
// would pin a stale address for the lifetime of the process.
const ipRefreshInterval = 10 * time.Minute

// detectPublicIPv4AndRegion queries external GeoIP endpoints to identify the
// public IPv4 address and country. Both come from the same response so they
// cannot disagree.
func detectPublicIPv4AndRegion() (string, string) {
	client := &http.Client{Timeout: ipLookupTimeout}

	// 1. Try Cloudflare trace (fast, SSL, worldwide CDN)
	if resp, err := client.Get("https://cloudflare.com/cdn-cgi/trace"); err == nil {
		defer resp.Body.Close()
		var ip, loc string
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "ip=") {
				ip = strings.TrimPrefix(line, "ip=")
			} else if strings.HasPrefix(line, "loc=") {
				loc = strings.TrimPrefix(line, "loc=")
			}
		}
		if loc != "" {
			return ip, strings.ToUpper(loc)
		}
	}

	// 2. Try ip-api.com
	if resp, err := client.Get("http://ip-api.com/line/?fields=countryCode,query"); err == nil {
		defer resp.Body.Close()
		var code, ip string
		scanner := bufio.NewScanner(resp.Body)
		if scanner.Scan() {
			code = strings.TrimSpace(scanner.Text())
		}
		if scanner.Scan() {
			ip = strings.TrimSpace(scanner.Text())
		}
		if len(code) == 2 {
			return ip, strings.ToUpper(code)
		}
	}

	// 3. Try api.country.is
	if resp, err := client.Get("https://api.country.is/"); err == nil {
		defer resp.Body.Close()
		var res struct {
			IP      string `json:"ip"`
			Country string `json:"country"`
		}
		if json.NewDecoder(resp.Body).Decode(&res) == nil && len(res.Country) == 2 {
			return res.IP, strings.ToUpper(res.Country)
		}
	}

	return "", "AUTO"
}

// detectPublicIPv6 asks IPv6-only endpoints for the egress address. There is no
// fallback and no region: a host without IPv6 connectivity simply fails every
// attempt, which is reported as "no IPv6" rather than as a guess.
func detectPublicIPv6() string {
	client := &http.Client{Timeout: ipLookupTimeout}
	for _, endpoint := range []string{"https://api6.ipify.org", "https://v6.ident.me"} {
		resp, err := client.Get(endpoint)
		if err != nil {
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 128))
		resp.Body.Close()
		if readErr != nil {
			continue
		}
		ip := strings.TrimSpace(string(body))
		if parsed := net.ParseIP(ip); parsed != nil && parsed.To4() == nil {
			return ip
		}
	}
	return ""
}

// startIPDetection keeps the node's egress addresses current. It runs
// regardless of whether the operator pinned a region: --region decides the
// label on the dashboard, not whether the agent knows its own address.
func (c *Collector) startIPDetection(autoRegion bool) {
	go func() {
		for {
			ipv4, region := detectPublicIPv4AndRegion()
			ipv6 := detectPublicIPv6()

			c.regionMu.Lock()
			if ipv4 != "" {
				c.publicIP = ipv4
			}
			if ipv6 != "" {
				c.publicIPv6 = ipv6
			}
			if autoRegion && region != "" && region != "AUTO" {
				c.region = region
			}
			detected := ipv4 != ""
			c.regionMu.Unlock()

			// Keep retrying quickly until the first successful lookup, then
			// settle into the refresh cadence.
			if !detected {
				time.Sleep(3 * time.Second)
				continue
			}
			time.Sleep(ipRefreshInterval)
		}
	}()
}

// NewCollector instantiates a new metrics collector.
func NewCollector(nodeID, name, token, region string) *Collector {
	_, _ = cpu.Percent(0, false)

	// Detect CPU Model once
	cpuModel := "Unknown CPU"
	if cpuInfos, err := cpu.Info(); err == nil && len(cpuInfos) > 0 {
		cpuModel = strings.TrimSpace(cpuInfos[0].ModelName)
	}

	// Detect Virtualization
	virt := detectVirtualization()

	// Initialize Pinger
	ctx, cancel := context.WithCancel(context.Background())
	pinger := NewPinger(DefaultTargets)
	go pinger.Start(ctx)

	col := &Collector{
		nodeID:         nodeID,
		name:           name,
		token:          token,
		region:         region,
		rateTracker:    NewRateTracker(),
		pinger:         pinger,
		pingerCancel:   cancel,
		cpuModel:       cpuModel,
		virtualization: virt,
	}

	// Always detect the egress address; only the region label is conditional.
	autoRegion := region == "" || strings.EqualFold(region, "auto") ||
		strings.EqualFold(region, "default") || strings.EqualFold(region, "global")
	col.startIPDetection(autoRegion)

	return col
}

// Close stops background routines like pinger.
func (c *Collector) Close() {
	if c.pingerCancel != nil {
		c.pingerCancel()
	}
}

// UpdatePingTargets updates the active targets monitored by the pinger.
func (c *Collector) UpdatePingTargets(targets []TargetConfig) {
	if c.pinger != nil {
		c.pinger.UpdateTargets(targets)
	}
}

// Collect gathers a snapshot conforming to the architecture and UI designs.
func (c *Collector) Collect() (*model.NodeReport, error) {
	now := time.Now()
	timestamp := now.Unix()

	// 1. Host information (OS, Kernel, Uptime)
	hostInfo, err := host.Info()
	osStr := runtime.GOOS
	kernelStr := ""
	var uptime uint64 = 0
	if err == nil && hostInfo != nil {
		if hostInfo.Platform != "" {
			osStr = fmt.Sprintf("%s %s", hostInfo.Platform, hostInfo.PlatformVersion)
		}
		kernelStr = hostInfo.KernelVersion
		uptime = hostInfo.Uptime
	}

	// 2. CPU percentage
	cpuPercents, err := cpu.Percent(0, false)
	cpuPercent := 0.0
	if err == nil && len(cpuPercents) > 0 {
		cpuPercent = math.Round(cpuPercents[0]*10) / 10
	}
	cpuCount, _ := cpu.Counts(true)

	// 3. Memory & Swap metrics
	vmem, err := mem.VirtualMemory()
	var memUsed, memTotal uint64
	if err == nil && vmem != nil {
		memUsed = vmem.Used
		memTotal = vmem.Total
	}

	swapMem, err := mem.SwapMemory()
	var swapUsed, swapTotal uint64
	if err == nil && swapMem != nil {
		swapUsed = swapMem.Used
		swapTotal = swapMem.Total
	}

	// 4. Disk metrics (root filesystem or system drive)
	rootPath := "/"
	if runtime.GOOS == "windows" {
		rootPath = "C:\\"
	}
	diskStat, err := disk.Usage(rootPath)
	var diskPercent float64
	var diskUsed, diskTotal uint64
	if err == nil && diskStat != nil {
		diskPercent = math.Round(diskStat.UsedPercent*10) / 10
		diskUsed = diskStat.Used
		diskTotal = diskStat.Total
	}

	// 5. System Load (Linux/Unix)
	var l1, l5, l15 float64
	if avg, err := load.Avg(); err == nil && avg != nil {
		l1 = math.Round(avg.Load1*100) / 100
		l5 = math.Round(avg.Load5*100) / 100
		l15 = math.Round(avg.Load15*100) / 100
	}

	// 6. Network metrics with virtual interface filtering
	netIOCounters, err := psnet.IOCounters(true)
	var totalSent, totalRecv uint64
	if err == nil {
		for _, nic := range netIOCounters {
			if IsPhysicalInterface(nic.Name) {
				totalSent += nic.BytesSent
				totalRecv += nic.BytesRecv
			}
		}
	}

	rateDown, rateUp := c.rateTracker.Update(totalSent, totalRecv, now)
	if rateDown > c.maxRateDown {
		c.maxRateDown = rateDown
	}
	if rateUp > c.maxRateUp {
		c.maxRateUp = rateUp
	}

	// 7. TCP & UDP connections
	tcpEst := getTcpEstablishedCount()
	udpEst := getUdpConnectionsCount()

	// 8. Ping Latency & Loss
	pings := c.pinger.GetStats()

	// Billing is operator-configured, so the agent reports it empty and lets the
	// server fill in whatever the dashboard has stored. The agent has no way to
	// know a node's price, cycle or quota, and a placeholder here would show up
	// as real data on the dashboard.
	billing := model.BillingInfo{}

	c.regionMu.RLock()
	currentRegion := c.region
	currentIP := c.publicIP
	currentIPv6 := c.publicIPv6
	c.regionMu.RUnlock()

	report := &model.NodeReport{
		NodeID:    c.nodeID,
		Token:     c.token,
		Timestamp: timestamp,
		Name:      c.name,
		Region:    currentRegion,
		Billing:   billing,
		System: model.SystemInfo{
			OS:             osStr,
			Kernel:         kernelStr,
			AgentVersion:   version.Version,
			PublicIP:       currentIP,
			PublicIPv6:     currentIPv6,
			Uptime:         uptime,
			CPUModel:       c.cpuModel,
			Virtualization: c.virtualization,
			CPUPercent:     cpuPercent,
			CPUCount:       cpuCount,
			MemUsed:        memUsed,
			MemTotal:       memTotal,
			SwapUsed:       swapUsed,
			SwapTotal:      swapTotal,
			DiskPercent:    diskPercent,
			DiskUsed:       diskUsed,
			DiskTotal:      diskTotal,
			Load1:          l1,
			Load5:          l5,
			Load15:         l15,
			ProcessCount:   0,
		},
		Network: model.NetworkInfo{
			BytesSent:       totalSent,
			BytesRecv:       totalRecv,
			TCPEstablished:  tcpEst,
			UDPEstablished:  udpEst,
			RateUpload:      math.Round(rateUp*100) / 100,
			RateDownload:    math.Round(rateDown*100) / 100,
			MonthlyPeakDown: math.Round(c.maxRateDown*100) / 100,
			MonthlyPeakUp:   math.Round(c.maxRateUp*100) / 100,
		},
		Pings: pings,
	}

	if hostInfo != nil {
		report.System.ProcessCount = int(hostInfo.Procs)
	}

	return report, nil
}

func detectVirtualization() string {
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return "docker"
	}
	if data, err := os.ReadFile("/sys/class/dmi/id/product_name"); err == nil {
		s := strings.ToLower(string(data))
		if strings.Contains(s, "kvm") {
			return "kvm"
		}
		if strings.Contains(s, "qemu") {
			return "qemu"
		}
		if strings.Contains(s, "vmware") {
			return "vmware"
		}
		if strings.Contains(s, "virtualbox") {
			return "virtualbox"
		}
	}
	return "kvm"
}

func getTcpEstablishedCount() int {
	if runtime.GOOS == "linux" {
		if count, err := readProcNetSnmpTcpEst(); err == nil {
			return count
		}
	}

	conns, err := psnet.Connections("tcp")
	if err != nil {
		return 0
	}
	count := 0
	for _, conn := range conns {
		if conn.Status == "ESTABLISHED" {
			count++
		}
	}
	return count
}

func getUdpConnectionsCount() int {
	if runtime.GOOS == "linux" {
		if file, err := os.Open("/proc/net/udp"); err == nil {
			defer file.Close()
			scanner := bufio.NewScanner(file)
			count := 0
			// Skip header
			if scanner.Scan() {
				for scanner.Scan() {
					count++
				}
			}
			return count
		}
	}
	return 4
}

func readProcNetSnmpTcpEst() (int, error) {
	file, err := os.Open("/proc/net/snmp")
	if err != nil {
		return 0, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	var headers []string
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "Tcp: ") {
			parts := strings.Fields(line[5:])
			if headers == nil {
				headers = parts
			} else {
				for i, h := range headers {
					if h == "CurrEstab" && i < len(parts) {
						if val, err := strconv.Atoi(parts[i]); err == nil {
							return val, nil
						}
					}
				}
			}
		}
	}
	return 0, fmt.Errorf("CurrEstab not found")
}
