package main

import (
	"context"
	"flag"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"probe/pkg/model"

	"github.com/gorilla/websocket"
)

type mockNodeConfig struct {
	nodeID     string
	name       string
	region     string
	tags       []string
	os         string
	kernel     string
	cpuModel   string
	cpuMark    string
	virt       string
	publicIP   string
	provider   string
	cores      int
	memTotal   uint64
	swapTotal  uint64
	diskTotal  uint64
	baseCPU    float64
	baseMem    float64
	baseSwap   float64
	baseDisk   float64
	baseDown   float64
	baseUp     float64
	telecomLat float64 // Ping to 电信 (e.g. 150ms as in screenshot)
}

var mockNodes = []mockNodeConfig{
	{
		nodeID:     "lightlayer-us",
		name:       "lightlayer",
		region:     "US",
		tags:       []string{"电信CN2", "16bps", "CU4837"},
		os:         "Debian GNU/Linux 13 (trixie)",
		kernel:     "6.12.43+deb13-amd64",
		cpuModel:   "Intel(R) Xeon(R) Platinum 9242 CPU @ 2.30GHz (1 vCPU)",
		cpuMark:    "中端服务器级",
		virt:       "kvm",
		publicIP:   "154.82.20.252",
		provider:   "圣何塞 · Zillion Network Inc. · AS54801",
		cores:      1,
		memTotal:   967 * 1024 * 1024,
		swapTotal:  3800 * 1024 * 1024,
		diskTotal:  46 * 1024 * 1024 * 1024,
		baseCPU:    1.0,
		baseMem:    14.5,
		baseSwap:   0.0,
		baseDisk:   4.8,
		baseDown:   8 * 1024,
		baseUp:     7 * 1024,
		telecomLat: 150.0,
	},
	{
		nodeID:     "hk-edge-node02",
		name:       "HK BGP Gateway",
		region:     "HK",
		tags:       []string{"BGP多线", "CN2 GIA", "100Mbps"},
		os:         "Ubuntu 24.04 LTS (noble)",
		kernel:     "6.8.0-31-generic",
		cpuModel:   "AMD EPYC 7763 64-Core Processor (4 vCPU)",
		cpuMark:    "高端计算型",
		virt:       "kvm",
		publicIP:   "103.145.74.88",
		provider:   "中国香港 · HGC Global Communications · AS9304",
		cores:      4,
		memTotal:   8 * 1024 * 1024 * 1024,
		swapTotal:  4 * 1024 * 1024 * 1024,
		diskTotal:  250 * 1024 * 1024 * 1024,
		baseCPU:    76.0, // Amber zone
		baseMem:    72.0,
		baseSwap:   12.0,
		baseDisk:   58.0,
		baseDown:   48 * 1024 * 1024,
		baseUp:     26 * 1024 * 1024,
		telecomLat: 28.5,
	},
	{
		nodeID:     "jp-tokyo-db03",
		name:       "Tokyo Core DB",
		region:     "JP",
		tags:       []string{"软银BGP", "NVMe RAID10", "高防"},
		os:         "Arch Linux (rolling)",
		kernel:     "6.10.3-arch1-1",
		cpuModel:   "AMD EPYC 9654 96-Core Processor (16 vCPU)",
		cpuMark:    "旗舰服务器级",
		virt:       "kvm",
		publicIP:   "194.156.160.10",
		provider:   "东京 · Equinix TY8 · AS17676",
		cores:      16,
		memTotal:   64 * 1024 * 1024 * 1024,
		swapTotal:  16 * 1024 * 1024 * 1024,
		diskTotal:  2000 * 1024 * 1024 * 1024,
		baseCPU:    88.5, // Rose zone
		baseMem:    86.0,
		baseSwap:   24.0,
		baseDisk:   78.4,
		baseDown:   6 * 1024 * 1024,
		baseUp:     15 * 1024 * 1024,
		telecomLat: 48.0,
	},
	{
		nodeID:     "eu-fra-transit04",
		name:       "Frankfurt Transit",
		region:     "EU-DE",
		tags:       []string{"DE-CIX", "1Gbps", "无限流量"},
		os:         "Alpine Linux v3.20",
		kernel:     "6.6.32-0-virt",
		cpuModel:   "Intel(R) Xeon(R) Gold 6148 CPU @ 2.40GHz (2 vCPU)",
		cpuMark:    "通用计算型",
		virt:       "kvm",
		publicIP:   "185.190.140.5",
		provider:   "法兰克福 · Hetzner Online GmbH · AS24940",
		cores:      2,
		memTotal:   4 * 1024 * 1024 * 1024,
		swapTotal:  2 * 1024 * 1024 * 1024,
		diskTotal:  80 * 1024 * 1024 * 1024,
		baseCPU:    14.0,
		baseMem:    28.0,
		baseSwap:   0.0,
		baseDisk:   19.5,
		baseDown:   35 * 1024 * 1024,
		baseUp:     30 * 1024 * 1024,
		telecomLat: 168.0,
	},
}

func main() {
	var (
		serverURL string
		token     string
	)
	flag.StringVar(&serverURL, "server", "ws://127.0.0.1:8088/api/v1/agent/ws", "Server Agent WS URL")
	flag.StringVar(&token, "token", "sk_default_secret_probe_token", "Auth Token")
	flag.Parse()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	log.Printf("==================================================")
	log.Printf("  Cyber Probe Cluster Simulator (Full Telemetry)")
	log.Printf("  Target Hub: %s", serverURL)
	log.Printf("  Nodes     : %d", len(mockNodes))
	log.Printf("==================================================")

	for _, cfg := range mockNodes {
		go runMockNode(ctx, serverURL, token, cfg)
		time.Sleep(200 * time.Millisecond)
	}

	<-ctx.Done()
	log.Println("Simulator stopped.")
}

func runMockNode(ctx context.Context, serverURL, token string, node mockNodeConfig) {
	header := http.Header{}
	header.Set("Authorization", "Bearer "+token)
	header.Set("X-Node-ID", node.nodeID)
	header.Set("X-Node-Name", node.name)
	header.Set("X-Node-Region", node.region)

	var uptime uint64 = 86400*3 + 3600*3 + 58*60 // 3 天 3 小时 58 分钟 (from screenshot)
	var bytesSent uint64 = 3800 * 1024 * 1024    // 3.8 GB
	var bytesRecv uint64 = 3400 * 1024 * 1024    // 3.4 GB
	step := 0.0

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		dialer := websocket.Dialer{HandshakeTimeout: 5 * time.Second}
		conn, _, err := dialer.DialContext(ctx, serverURL, header)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}

		log.Printf("[%s] Connected to Hub as %s (%s)", node.nodeID, node.name, node.region)
		ticker := time.NewTicker(1 * time.Second)

		active := true
		for active {
			select {
			case <-ctx.Done():
				_ = conn.Close()
				return
			case <-ticker.C:
				step += 0.15
				uptime++

				cpuWave := math.Sin(step) * 1.5
				cpuJitter := (rand.Float64() - 0.5) * 0.8
				cpu := math.Max(0.5, math.Min(99.0, node.baseCPU+cpuWave+cpuJitter))

				memJitter := (rand.Float64() - 0.5) * 1.0
				memPct := math.Max(5.0, math.Min(98.0, node.baseMem+memJitter))
				memUsed := uint64(float64(node.memTotal) * (memPct / 100.0))

				swapUsed := uint64(float64(node.swapTotal) * (node.baseSwap / 100.0))
				diskUsed := uint64(float64(node.diskTotal) * (node.baseDisk / 100.0))

				downWave := 1.0 + math.Sin(step*1.2)*0.3 + (rand.Float64()-0.5)*0.15
				upWave := 1.0 + math.Cos(step*1.1)*0.3 + (rand.Float64()-0.5)*0.15
				rateDown := math.Max(0, node.baseDown*downWave)
				rateUp := math.Max(0, node.baseUp*upWave)

				bytesRecv += uint64(rateDown)
				bytesSent += uint64(rateUp)
				tcpEst := int(104 + cpu*2.0 + float64(rand.Intn(6)))
				udpEst := 4

				// Monitored Pings matching screenshots
				pings := []model.PingStat{
					{
						Target:     "8.8.8.8",
						Label:      "Google",
						Color:      "#ef4444",
						LatencyMs:  math.Round((1.0+rand.Float64()*0.4)*100) / 100,
						PacketLoss: 0.00,
						Jitter:     0.05,
					},
					{
						Target:     "223.5.5.5",
						Label:      "电信",
						Color:      "#06b6d4",
						LatencyMs:  math.Round((node.telecomLat+rand.Float64()*1.2)*100) / 100,
						PacketLoss: 0.00,
						Jitter:     0.18,
					},
					{
						Target:     "www.youtube.com",
						Label:      "Youtube",
						Color:      "#a855f7",
						LatencyMs:  math.Round((1.1+rand.Float64()*0.5)*100) / 100,
						PacketLoss: 0.00,
						Jitter:     0.08,
					},
					{
						Target:     "api.openai.com",
						Label:      "ChatGPT",
						Color:      "#3b82f6",
						LatencyMs:  math.Round((1.2+rand.Float64()*0.3)*100) / 100,
						PacketLoss: 0.00,
						Jitter:     0.06,
					},
					{
						Target:     "api.anthropic.com",
						Label:      "Claude",
						Color:      "#f97316",
						LatencyMs:  math.Round((2.0+rand.Float64()*0.6)*100) / 100,
						PacketLoss: 0.00,
						Jitter:     0.10,
					},
				}

				report := model.NodeReport{
					NodeID:    node.nodeID,
					Token:     token,
					Timestamp: time.Now().Unix(),
					Name:      node.name,
					Region:    node.region,
					Tags:      node.tags,
					Billing: model.BillingInfo{
						PricePerMonth:  9.9,
						Currency:       "$",
						RemainingDays:  27,
						RemainingValue: 59.84,
						BandwidthQuota: 2 * 1024 * 1024 * 1024 * 1024, // 2 TB
						Provider:       node.provider,
					},
					System: model.SystemInfo{
						OS:             node.os,
						Kernel:         node.kernel,
						Uptime:         uptime,
						CPUModel:       node.cpuModel,
						CPUMark:        node.cpuMark,
						Virtualization: node.virt,
						PublicIP:       node.publicIP,
						CPUPercent:     math.Round(cpu*10) / 10,
						MemUsed:        memUsed,
						MemTotal:       node.memTotal,
						SwapUsed:       swapUsed,
						SwapTotal:      node.swapTotal,
						DiskPercent:    math.Round(node.baseDisk*10) / 10,
						DiskUsed:       diskUsed,
						DiskTotal:      node.diskTotal,
						Load1:          math.Round((cpu/100.0)*float64(node.cores)*100) / 100,
						Load5:          math.Round((cpu/100.0)*float64(node.cores)*0.9*100) / 100,
						Load15:         math.Round((cpu/100.0)*float64(node.cores)*0.8*100) / 100,
						CPUCount:       node.cores,
						ProcessCount:   87,
					},
					Network: model.NetworkInfo{
						BytesSent:       bytesSent,
						BytesRecv:       bytesRecv,
						TCPEstablished:  tcpEst,
						UDPEstablished:  udpEst,
						RateUpload:      math.Round(rateUp*100) / 100,
						RateDownload:    math.Round(rateDown*100) / 100,
						MonthlyPeakDown: 1.2 * 1024 * 1024,
						MonthlyPeakUp:   1.2 * 1024 * 1024,
					},
					Pings: pings,
				}

				if err := conn.WriteJSON(report); err != nil {
					active = false
					break
				}
			}
		}

		ticker.Stop()
		_ = conn.Close()
		time.Sleep(2 * time.Second)
	}
}
