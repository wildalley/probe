package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"probe/pkg/model"
	"probe/pkg/netguard"

	"github.com/gorilla/websocket"
)

var (
	geoIPCache    sync.Map // map[string]*GeoIPDetails
	ErrNodeActive = errors.New("stop the agent before deleting this node")
)

// GeoIPDetails contains resolved geographic location, ISP, ASN, provider, and line tag.
type GeoIPDetails struct {
	IP          string `json:"ip"`
	CountryCode string `json:"country_code"`
	Country     string `json:"country"`
	City        string `json:"city"`
	ISP         string `json:"isp"`
	Org         string `json:"org"`
	ASN         string `json:"asn"`
	Provider    string `json:"provider"`
	LineTag     string `json:"line_tag"`
}

// ResolveNodeGeoAndProvider queries multi-source IP geolocation & ASN APIs with caching.
func ResolveNodeGeoAndProvider(ip string) *GeoIPDetails {
	ip = strings.TrimSpace(ip)
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return nil
	}
	if netguard.IsBlockedIP(parsedIP) {
		return &GeoIPDetails{
			IP:          ip,
			CountryCode: "LOCAL",
			Country:     "Localhost",
			City:        "Local LAN",
			Provider:    "Local Network · 局域网",
			LineTag:     "本地内网",
		}
	}

	if val, ok := geoIPCache.Load(ip); ok {
		if details, ok := val.(*GeoIPDetails); ok {
			return details
		}
	}

	// `ip` reaches here from an agent report or the lookup endpoint, and is
	// interpolated into the request path below, so the dial goes through the
	// outbound guard like every other operator-influenced request.
	client := netguard.NewGuardedHTTPClient(4 * time.Second)
	var details GeoIPDetails
	details.IP = ip

	// 1. Primary: ipwho.is (fast, HTTPS, rich ASN & ISP)
	req1, _ := http.NewRequest("GET", "https://ipwho.is/"+ip, nil)
	req1.Header.Set("User-Agent", "Probe-Server/1.0")
	if resp, err := client.Do(req1); err == nil {
		defer resp.Body.Close()
		var res struct {
			Success     bool   `json:"success"`
			CountryCode string `json:"country_code"`
			Country     string `json:"country"`
			City        string `json:"city"`
			Connection  struct {
				ASN int    `json:"asn"`
				Org string `json:"org"`
				ISP string `json:"isp"`
			} `json:"connection"`
		}
		if json.NewDecoder(resp.Body).Decode(&res) == nil && res.Success && res.CountryCode != "" {
			details.CountryCode = strings.ToUpper(res.CountryCode)
			details.Country = res.Country
			details.City = res.City
			details.ISP = res.Connection.ISP
			details.Org = res.Connection.Org
			if res.Connection.ASN > 0 {
				details.ASN = fmt.Sprintf("AS%d", res.Connection.ASN)
			}
		}
	}

	// 2. Fallback: api.ip.sb
	if details.CountryCode == "" {
		req2, _ := http.NewRequest("GET", "https://api.ip.sb/geoip/"+ip, nil)
		req2.Header.Set("User-Agent", "Probe-Server/1.0")
		if resp, err := client.Do(req2); err == nil {
			defer resp.Body.Close()
			var res struct {
				CountryCode  string `json:"country_code"`
				Country      string `json:"country"`
				City         string `json:"city"`
				ISP          string `json:"isp"`
				Organization string `json:"organization"`
				ASN          int    `json:"asn"`
				ASNOrg       string `json:"asn_organization"`
			}
			if json.NewDecoder(resp.Body).Decode(&res) == nil && res.CountryCode != "" {
				details.CountryCode = strings.ToUpper(res.CountryCode)
				details.Country = res.Country
				details.City = res.City
				details.ISP = res.ISP
				if res.Organization != "" {
					details.Org = res.Organization
				} else {
					details.Org = res.ASNOrg
				}
				if res.ASN > 0 {
					details.ASN = fmt.Sprintf("AS%d", res.ASN)
				}
			}
		}
	}

	// 3. Fallback: ip-api.com
	if details.CountryCode == "" {
		req3, _ := http.NewRequest("GET", "http://ip-api.com/json/"+ip+"?fields=status,country,countryCode,city,isp,org,as", nil)
		if resp, err := client.Do(req3); err == nil {
			defer resp.Body.Close()
			var res struct {
				Status      string `json:"status"`
				Country     string `json:"country"`
				CountryCode string `json:"countryCode"`
				City        string `json:"city"`
				ISP         string `json:"isp"`
				Org         string `json:"org"`
				AS          string `json:"as"`
			}
			if json.NewDecoder(resp.Body).Decode(&res) == nil && res.Status == "success" && res.CountryCode != "" {
				details.CountryCode = strings.ToUpper(res.CountryCode)
				details.Country = res.Country
				details.City = res.City
				details.ISP = res.ISP
				details.Org = res.Org
				parts := strings.Split(res.AS, " ")
				if len(parts) > 0 && strings.HasPrefix(parts[0], "AS") {
					details.ASN = parts[0]
				}
			}
		}
	}

	if details.CountryCode == "" {
		details.CountryCode = "GLOBAL"
	}

	// Build clean Provider representation
	orgName := details.Org
	if orgName == "" {
		orgName = details.ISP
	}
	if orgName == "" {
		orgName = "Global Cloud"
	}

	if details.ASN != "" {
		details.Provider = fmt.Sprintf("%s · %s", orgName, details.ASN)
	} else {
		details.Provider = orgName
	}

	// Infer Route / Line Tag
	details.LineTag = inferLineTag(details.ASN, orgName, details.ISP)

	geoIPCache.Store(ip, &details)
	return &details
}

// inferLineTag identifies telecom carrier or cloud routing (CN2, 4837, 9929, CMI, BGP, etc.)
func inferLineTag(asn, org, isp string) string {
	upper := strings.ToUpper(asn + " " + org + " " + isp)

	switch {
	case strings.Contains(upper, "AS4809") || strings.Contains(upper, "CN2"):
		return "电信CN2 GIA"
	case strings.Contains(upper, "AS9929") || strings.Contains(upper, "9929"):
		return "联通9929精简"
	case strings.Contains(upper, "AS4837") || strings.Contains(upper, "CHINA UNICOM"):
		return "联通4837大带宽"
	case strings.Contains(upper, "AS58453") || strings.Contains(upper, "AS58807") || strings.Contains(upper, "CMI"):
		return "移动CMI直连"
	case strings.Contains(upper, "AS4134") || strings.Contains(upper, "CHINANET"):
		return "电信163骨干"
	case strings.Contains(upper, "AS13335") || strings.Contains(upper, "CLOUDFLARE"):
		return "Cloudflare Anycast"
	case strings.Contains(upper, "AS16509") || strings.Contains(upper, "AMAZON"):
		return "AWS 全球骨干"
	case strings.Contains(upper, "AS15169") || strings.Contains(upper, "GOOGLE"):
		return "Google Cloud Premium"
	case strings.Contains(upper, "AS8075") || strings.Contains(upper, "MICROSOFT") || strings.Contains(upper, "AZURE"):
		return "Azure 全球内网"
	case strings.Contains(upper, "AS31898") || strings.Contains(upper, "ORACLE"):
		return "甲骨文 Oracle Cloud"
	case strings.Contains(upper, "AS24940") || strings.Contains(upper, "HETZNER"):
		return "Hetzner 欧洲高防"
	case strings.Contains(upper, "AS16276") || strings.Contains(upper, "OVH"):
		return "OVH 极速抗D"
	case strings.Contains(upper, "AS20473") || strings.Contains(upper, "CHOOPA") || strings.Contains(upper, "VULTR"):
		return "Vultr 全球BGP"
	case strings.Contains(upper, "AS14061") || strings.Contains(upper, "DIGITALOCEAN"):
		return "DigitalOcean BGP"
	case strings.Contains(upper, "AS45102") || strings.Contains(upper, "ALIBABA") || strings.Contains(upper, "ALIYUN"):
		return "阿里云 BGP"
	case strings.Contains(upper, "AS132203") || strings.Contains(upper, "TENCENT"):
		return "腾讯云 BGP"
	case strings.Contains(upper, "AS25820") || strings.Contains(upper, "IT7") || strings.Contains(upper, "BANDWAGON"):
		return "搬瓦工 CN2 GIA"
	case strings.Contains(upper, "AS54801") || strings.Contains(upper, "FRANTECH") || strings.Contains(upper, "BUYVM"):
		return "BuyVM 优质路由"
	case strings.Contains(upper, "AS63949") || strings.Contains(upper, "LINODE") || strings.Contains(upper, "AKAMAI"):
		return "Linode/Akamai BGP"
	default:
		return "全网 BGP 多线"
	}
}

// Hub manages purely in-memory node states and real-time event broadcasting to Web clients.
type Hub struct {
	storage     *Storage
	downsampler *Downsampler

	mu         sync.RWMutex
	nodeStates map[string]*model.NodeState

	clientsMu sync.RWMutex
	clients   map[*wsWriteQueue]struct{}

	settingsMu    sync.RWMutex
	nodeSettings  map[string]*model.NodeSettings
	ratesMu       sync.RWMutex
	exchangeRates map[string]float64

	agentMu      sync.RWMutex
	agentConns   map[string]*wsWriteQueue
	targetSyncMu sync.Mutex

	broadcastChan  chan *model.WSEvent
	broadcastMu    sync.Mutex
	broadcastSeq   atomic.Uint64
	offlineTimeout int64 // in seconds, e.g. 6s

	notifierMu sync.RWMutex
	notifier   *Notifier
}

// SetNotifier associates the notification dispatcher with the Hub.
func (h *Hub) SetNotifier(n *Notifier) {
	h.notifierMu.Lock()
	h.notifier = n
	h.notifierMu.Unlock()
}

func (h *Hub) getNotifier() *Notifier {
	h.notifierMu.RLock()
	defer h.notifierMu.RUnlock()
	return h.notifier
}

// NewHub initializes the in-memory Hub.
func NewHub(storage *Storage, downsampler *Downsampler) *Hub {
	h := &Hub{
		storage:        storage,
		downsampler:    downsampler,
		nodeStates:     make(map[string]*model.NodeState),
		clients:        make(map[*wsWriteQueue]struct{}),
		nodeSettings:   make(map[string]*model.NodeSettings),
		exchangeRates:  map[string]float64{"USD": 7.18, "EUR": 7.82, "HKD": 0.92, "GBP": 9.35, "JPY": 0.048},
		agentConns:     make(map[string]*wsWriteQueue),
		broadcastChan:  make(chan *model.WSEvent, 1024),
		offlineTimeout: 6, // 6 seconds without report -> mark offline
	}

	// Load existing node settings and exchange rates from SQLite
	h.ReloadSettings()

	// Load existing nodes from SQLite into in-memory state (initially marked offline)
	if existingNodes, err := storage.GetAllNodes(); err == nil {
		for _, n := range existingNodes {
			h.nodeStates[n.NodeID] = &model.NodeState{
				NodeID:   n.NodeID,
				Name:     n.Name,
				Region:   n.Region,
				IsOnline: false,
				LastSeen: n.LastSeen,
				System: model.SystemInfo{
					OS:           n.OS,
					Kernel:       n.Kernel,
					PublicIP:     n.PublicIP,
					PublicIPv6:   n.PublicIPv6,
					AgentVersion: n.AgentVersion,
				},
			}
		}
	}

	return h
}

// Start launches the background dispatching and offline-detection loops.
func (h *Hub) Start(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case event := <-h.broadcastChan:
			h.broadcastToClients(event)
		case <-ticker.C:
			h.checkOfflineNodes()
		}
	}
}

// ReloadSettings reloads all node settings overrides and system exchange rates from SQLite.
func (h *Hub) ReloadSettings() {
	if s, err := h.storage.GetAllNodeSettings(); err == nil {
		h.settingsMu.Lock()
		h.nodeSettings = s
		h.settingsMu.Unlock()
	}
	if str, err := h.storage.GetSystemSetting("exchange_rates"); err == nil && str != "" {
		var sysSettings model.SystemSettings
		if err := json.Unmarshal([]byte(str), &sysSettings); err == nil && sysSettings.ExchangeRates != nil {
			h.ratesMu.Lock()
			h.exchangeRates = sysSettings.ExchangeRates
			h.ratesMu.Unlock()
		}
	}
}

// RegisterAgent records a connected agent socket and sends current ping targets.
// The agent handler calls this again on every report to cover agents that only
// reveal their node ID in the payload, so re-registering the same queue is a
// no-op — otherwise each report would trigger another config query and push.
func (h *Hub) RegisterAgent(nodeID string, q *wsWriteQueue) {
	h.targetSyncMu.Lock()
	defer h.targetSyncMu.Unlock()
	h.agentMu.Lock()
	if q.IsClosed() {
		h.agentMu.Unlock()
		return
	}
	if existing, ok := h.agentConns[nodeID]; ok && existing == q {
		h.agentMu.Unlock()
		return
	}
	if existing := h.agentConns[nodeID]; existing != nil {
		existing.Close()
	}
	h.agentConns[nodeID] = q
	h.agentMu.Unlock()

	targets, err := h.storage.GetPingTargets()
	if err == nil {
		payload, ok := pingTargetsPayload(nodeID, targets)
		if !ok {
			return
		}
		if !q.Send(payload) {
			q.Close()
		}
	}
}

// UnregisterAgent removes an agent connection.
func (h *Hub) UnregisterAgent(nodeID string, q *wsWriteQueue) {
	h.agentMu.Lock()
	if h.agentConns[nodeID] == q {
		delete(h.agentConns, nodeID)
	}
	h.agentMu.Unlock()
}

// BroadcastPingTargetsSync pushes active targets to all connected agents.
func (h *Hub) BroadcastPingTargetsSync() {
	h.targetSyncMu.Lock()
	defer h.targetSyncMu.Unlock()
	targets, err := h.storage.GetPingTargets()
	if err != nil {
		return
	}

	h.agentMu.RLock()
	defer h.agentMu.RUnlock()
	for nodeID, q := range h.agentConns {
		payload, ok := pingTargetsPayload(nodeID, targets)
		if !ok {
			continue
		}
		if !q.Send(payload) {
			q.Close()
		}
	}
}

// pingTargetsPayload builds the config_sync frame for one agent.
func pingTargetsPayload(nodeID string, targets []model.PingTargetConfig) ([]byte, bool) {
	active := make([]model.PingTargetConfig, 0, len(targets))
	for _, t := range targets {
		if t.Enabled && targetAppliesToNode(t, nodeID) && netguard.ValidatePingTarget(t.Protocol, t.Target, t.Port) == nil {
			active = append(active, t)
		}
	}

	payload, err := json.Marshal(map[string]interface{}{
		"type": "config_sync",
		"data": map[string]interface{}{
			"ping_targets": active,
		},
	})
	if err != nil {
		return nil, false
	}
	return payload, true
}

func targetAppliesToNode(t model.PingTargetConfig, nodeID string) bool {
	if len(t.Servers) > 0 {
		return containsNodeID(t.Servers, nodeID)
	}
	return t.AutoStart || containsNodeID(t.AssignedServers, nodeID)
}

func containsNodeID(ids []string, nodeID string) bool {
	for _, id := range ids {
		if id == nodeID {
			return true
		}
	}
	return false
}

// pickPublicIP decides which address a node is known by, per family. Precedence:
// the operator's correction, then what the agent detected for itself, then the
// address the server saw the agent connect from.
//
// Every candidate has to look like a real public address. The socket address is
// a proxy hop or a container bridge in most deployments, and displaying
// 172.20.1.0 under a 公网 IP heading is worse than displaying nothing — so a
// blocked address is dropped rather than shown. PROBE_ALLOW_PRIVATE_TARGETS
// relaxes the check for deployments that are deliberately internal.
func pickPublicIP(settings *model.NodeSettings, reportV4, reportV6, clientIP string) (string, string) {
	allowPrivate := netguard.AllowPrivateTargets()

	var v4, v6 string
	pick := func(raw string) {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			return
		}
		parsed := net.ParseIP(raw)
		if parsed == nil {
			return
		}
		if !allowPrivate && netguard.IsBlockedIP(parsed) {
			return
		}
		if parsed.To4() != nil {
			if v4 == "" {
				v4 = raw
			}
		} else if v6 == "" {
			v6 = raw
		}
	}

	if settings != nil {
		pick(settings.PublicIP)
		pick(settings.PublicIPv6)
	}
	// The agent's own view outranks the socket address: with a reverse proxy or
	// DNAT in front, the socket address is the proxy, not the node.
	pick(reportV4)
	pick(reportV6)
	pick(clientIP)

	return v4, v6
}

// isLoopbackAddr reports whether an address is the local host. A server and an
// agent on the same machine genuinely talk over loopback, which is worth
// labelling as LOCAL even though the address itself is not a public one.
func isLoopbackAddr(raw string) bool {
	parsed := net.ParseIP(strings.TrimSpace(raw))
	return parsed != nil && parsed.IsLoopback()
}

// IngestReport processes an incoming metric payload from an Agent. clientIP is
// the address the report arrived from, used only as a last-resort guess at the
// node's egress address.
func (h *Hub) IngestReport(report *model.NodeReport, clientIP string) {
	now := time.Now().Unix()

	// Calculate memory percentage
	memPercent := 0.0
	if report.System.MemTotal > 0 {
		memPercent = math.Round((float64(report.System.MemUsed)/float64(report.System.MemTotal)*100)*10) / 10
	}

	uptimeStr := formatUptime(report.System.Uptime)

	name := report.Name
	if name == "" {
		name = report.NodeID
	}
	region := strings.TrimSpace(report.Region)

	// Tags and billing are operator-configured and have never been settable on
	// the agent side — there is no flag or config key for either. Anything
	// arriving in these fields is the hardcoded demo payload from an agent built
	// before that was removed, so it is dropped outright instead of being
	// pattern-matched against the specific fake strings that build happened to
	// use. A node running an old agent shows empty until it is configured, which
	// is the truth, rather than showing $9.9 / 27 天 / 2TB as if they were real.
	tags := []string(nil)
	billing := model.BillingInfo{}

	// Same story for CPUMark: nothing measures it, and the old agent stamped one
	// fixed label onto every host regardless of hardware. Cleared here so the
	// dashboard falls back to a label derived from the real core count.
	report.System.CPUMark = ""

	// Settings are resolved before the address is, because an operator's
	// correction has to drive GeoIP, persistence and the dashboard alike.
	h.settingsMu.RLock()
	settings, hasSettings := h.nodeSettings[report.NodeID]
	h.settingsMu.RUnlock()

	ip, ipv6 := pickPublicIP(settings, report.System.PublicIP, report.System.PublicIPv6, clientIP)
	report.System.PublicIP = ip
	report.System.PublicIPv6 = ipv6

	if ip == "" && ipv6 == "" && isLoopbackAddr(clientIP) {
		region = "LOCAL"
	}

	// GeoIP keys off whichever address is actually trusted. IPv6 is a valid key
	// for every provider queried, so a v6-only host still resolves.
	geoKey := ip
	if geoKey == "" {
		geoKey = ipv6
	}

	var geoDetails *GeoIPDetails
	if geoKey != "" {
		if val, ok := geoIPCache.Load(geoKey); ok {
			geoDetails, _ = val.(*GeoIPDetails)
		}
	}

	// If cached geoDetails exists, apply immediately to region, provider and tags
	if geoDetails != nil {
		if region == "" || strings.EqualFold(region, "auto") || strings.EqualFold(region, "default") || strings.EqualFold(region, "global") {
			if geoDetails.CountryCode != "" {
				region = geoDetails.CountryCode
			}
		}
		if billing.Provider == "" && geoDetails.Provider != "" {
			billing.Provider = geoDetails.Provider
		}
		if len(tags) == 0 && geoDetails.LineTag != "" {
			tags = []string{geoDetails.LineTag, geoDetails.CountryCode}
		}
	} else if geoKey != "" {
		// Launch background async resolution and push update when resolved
		go func(nodeID, targetIP string) {
			details := ResolveNodeGeoAndProvider(targetIP)
			if details != nil && details.CountryCode != "" && details.CountryCode != "GLOBAL" {
				h.mu.Lock()
				if current, found := h.nodeStates[nodeID]; found && (current.System.PublicIP == targetIP || current.System.PublicIPv6 == targetIP) {
					st := cloneNodeState(current)
					h.settingsMu.RLock()
					customSettings := h.nodeSettings[nodeID]
					h.settingsMu.RUnlock()

					updated := false
					if (customSettings == nil || customSettings.Region == "") &&
						(st.Region == "" || strings.EqualFold(st.Region, "auto") || strings.EqualFold(st.Region, "default") || strings.EqualFold(st.Region, "global")) {
						st.Region = details.CountryCode
						updated = true
					}
					if (customSettings == nil || customSettings.Provider == "") && st.Billing.Provider == "" {
						st.Billing.Provider = details.Provider
						updated = true
					}
					if (customSettings == nil || len(customSettings.Tags) == 0) && len(st.Tags) == 0 {
						st.Tags = []string{details.LineTag, details.CountryCode}
						updated = true
					}
					if updated {
						h.nodeStates[nodeID] = st
						_ = h.storage.UpsertNode(&model.NodeMetadata{
							NodeID:       st.NodeID,
							Name:         st.Name,
							Region:       st.Region,
							OS:           st.System.OS,
							Kernel:       st.System.Kernel,
							PublicIP:     st.System.PublicIP,
							PublicIPv6:   st.System.PublicIPv6,
							AgentVersion: st.System.AgentVersion,
							IsOnline:     true,
							LastSeen:     st.LastSeen,
						})
						h.sendBroadcast(&model.WSEvent{
							Type:      "node_update",
							Timestamp: time.Now().Unix(),
							Data:      cloneNodeState(st),
						})
					}
				}
				h.mu.Unlock()
			}
		}(report.NodeID, geoKey)
	}

	// Apply node settings overrides if configured
	if hasSettings && settings != nil {
		if settings.Name != "" {
			name = settings.Name
		}
		if settings.Region != "" {
			region = settings.Region
		}
		if len(settings.Tags) > 0 {
			tags = settings.Tags
		}
		if settings.Provider != "" {
			billing.Provider = settings.Provider
		}
		if settings.Price > 0 {
			billing.Price = settings.Price
		}
		if settings.Currency != "" {
			billing.Currency = settings.Currency
		}
		if settings.BillingCycle != "" {
			billing.BillingCycle = settings.BillingCycle
		}
		if settings.ExpiryDate != "" {
			billing.ExpiryDate = settings.ExpiryDate
		}
		if settings.BandwidthQuota > 0 {
			billing.BandwidthQuota = settings.BandwidthQuota
		}
		billing.AutoRenewal = settings.AutoRenewal
		billing.Note = settings.Note
	}

	// 已用流量 follows the calibration model: the operator's number is a
	// baseline, not a final value, and real traffic keeps accumulating on top of
	// it. A correction therefore never freezes the counter.
	live := report.Network.BytesSent + report.Network.BytesRecv
	billing.BandwidthLive = live
	if hasSettings && settings != nil && settings.BandwidthUsed > 0 {
		anchor := settings.BandwidthBaseCounter
		if anchor == 0 || live < anchor {
			// First calibration, or the interface counter went backwards (OS
			// restart, NIC rebuilt). Move the anchor to the current reading; the
			// already-accumulated part survives on the baseline.
			anchor = live
			h.persistBandwidthAnchor(report.NodeID, anchor)
		}
		billing.BandwidthUsed = settings.BandwidthUsed + (live - anchor)
	} else {
		billing.BandwidthUsed = live
	}

	// Calculate Billing Details: PricePerMonth, RemainingDays, RemainingValue
	h.ratesMu.RLock()
	rates := h.exchangeRates
	h.ratesMu.RUnlock()

	h.calculateBilling(&billing, rates)

	// Calculate swap percentage
	swapPercent := 0.0
	if report.System.SwapTotal > 0 {
		swapPercent = math.Round((float64(report.System.SwapUsed)/float64(report.System.SwapTotal)*100)*10) / 10
	}

	state := &model.NodeState{
		NodeID:    report.NodeID,
		Name:      name,
		Region:    region,
		Tags:      tags,
		Billing:   billing,
		IsOnline:  true,
		LastSeen:  now,
		System:    report.System,
		Network:   report.Network,
		Pings:     report.Pings,
		CPU:       report.System.CPUPercent,
		Mem:       memPercent,
		Swap:      swapPercent,
		Disk:      report.System.DiskPercent,
		RateDown:  report.Network.RateDownload,
		RateUp:    report.Network.RateUpload,
		UptimeStr: uptimeStr,
	}

	h.mu.Lock()
	prevState, wasKnown := h.nodeStates[report.NodeID]
	wasOffline := wasKnown && !prevState.IsOnline
	h.nodeStates[report.NodeID] = state
	h.mu.Unlock()

	notif := h.getNotifier()
	if wasOffline && notif != nil {
		notif.NotifyNodeRecovery(state)
	}
	if notif != nil {
		notif.CheckTrafficQuota(state)
	}

	// Update SQLite node metadata asynchronously
	go func() {
		err := h.storage.UpsertNode(&model.NodeMetadata{
			NodeID:       report.NodeID,
			Name:         name,
			Token:        report.Token,
			Region:       region,
			OS:           report.System.OS,
			Kernel:       report.System.Kernel,
			PublicIP:     report.System.PublicIP,
			PublicIPv6:   report.System.PublicIPv6,
			AgentVersion: report.System.AgentVersion,
			IsOnline:     true,
			LastSeen:     now,
		})
		if err != nil {
			// The in-memory state already updated, so this node looks healthy
			// until the next restart silently forgets it. Say so.
			log.Printf("[Hub] Failed to persist node %s: %v", report.NodeID, err)
		}
	}()

	// Ingest into downsampler for historical persistence
	h.downsampler.RecordIngest(report)

	// Broadcast update to all Web clients
	h.sendBroadcast(&model.WSEvent{
		Type:      "node_update",
		Timestamp: now,
		Data:      cloneNodeState(state),
	})
}

// persistBandwidthAnchor records the interface counter that a calibration
// baseline was taken at. It updates the in-memory settings too: without that,
// the next report would find BandwidthBaseCounter == 0 again, re-anchor to its
// own live value, and freeze 已用流量 exactly the way the old code did.
//
// A single node's reports are serialized by its WebSocket read loop, so the
// map entry this touches is not being read concurrently for the same node.
func (h *Hub) persistBandwidthAnchor(nodeID string, anchor uint64) {
	h.settingsMu.Lock()
	if s, ok := h.nodeSettings[nodeID]; ok {
		s.BandwidthBaseCounter = anchor
	}
	h.settingsMu.Unlock()

	if err := h.storage.UpdateBandwidthBaseCounter(nodeID, anchor); err != nil {
		log.Printf("[Hub] Failed to persist bandwidth anchor for %s: %v", nodeID, err)
	}
}

func (h *Hub) calculateBilling(billing *model.BillingInfo, rates map[string]float64) {
	if billing.Price <= 0 && billing.PricePerMonth > 0 {
		billing.Price = billing.PricePerMonth
	}
	if billing.Currency == "" {
		billing.Currency = "$"
	}
	if billing.BillingCycle == "" {
		billing.BillingCycle = "month"
	}

	// Cycle days & months
	cycleDays := 30
	monthsInCycle := 1.0
	switch billing.BillingCycle {
	case "quarter":
		cycleDays = 90
		monthsInCycle = 3
	case "half_year":
		cycleDays = 180
		monthsInCycle = 6
	case "year":
		cycleDays = 365
		monthsInCycle = 12
	case "two_year":
		cycleDays = 730
		monthsInCycle = 24
	case "three_year":
		cycleDays = 1095
		monthsInCycle = 36
	default:
		cycleDays = 30
		monthsInCycle = 1
	}

	billing.PricePerMonth = math.Round((billing.Price/monthsInCycle)*100) / 100

	// Remaining days come only from a configured expiry date. With no expiry
	// set, the honest answer is "未设到期" — 0 — not a fabricated 30-day cycle.
	billing.RemainingDays = 0
	if billing.ExpiryDate != "" {
		if t, err := time.Parse("2006-01-02", billing.ExpiryDate); err == nil {
			now := time.Now()
			t = t.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
			diff := t.Sub(now)
			if diff > 0 {
				billing.RemainingDays = int(diff.Hours() / 24)
			}
		}
	}

	// Calculate remaining value in native currency
	var remainingNative float64
	if cycleDays > 0 && billing.RemainingDays > 0 {
		remainingNative = (billing.Price / float64(cycleDays)) * float64(billing.RemainingDays)
	}

	// Exchange rate conversion to base currency CNY
	rate := 1.0
	cur := strings.ToUpper(strings.TrimSpace(billing.Currency))
	if cur == "$" || cur == "USD" {
		if r, ok := rates["USD"]; ok && r > 0 {
			rate = r
		} else {
			rate = 7.18
		}
	} else if cur == "€" || cur == "EUR" {
		if r, ok := rates["EUR"]; ok && r > 0 {
			rate = r
		} else {
			rate = 7.82
		}
	} else if cur == "HK$" || cur == "HKD" {
		if r, ok := rates["HKD"]; ok && r > 0 {
			rate = r
		} else {
			rate = 0.92
		}
	} else if cur == "£" || cur == "GBP" {
		if r, ok := rates["GBP"]; ok && r > 0 {
			rate = r
		} else {
			rate = 9.35
		}
	} else if cur == "JP¥" || cur == "JPY" {
		if r, ok := rates["JPY"]; ok && r > 0 {
			rate = r
		} else {
			rate = 0.048
		}
	}

	// RemainingValue is the base-currency (CNY) figure the admin totals sum;
	// RemainingValueNative is the same amount in the node's own currency, which
	// is what the per-node cards render. When there is no expiry both are 0.
	billing.RemainingValue = math.Round(remainingNative*rate*100) / 100
	billing.RemainingValueNative = math.Round(remainingNative*100) / 100
}

// checkOfflineNodes checks for nodes that haven't sent a heartbeat within the timeout.
func (h *Hub) checkOfflineNodes() {
	now := time.Now().Unix()
	var transitionedOffline []*model.NodeState

	notif := h.getNotifier()
	timeout := h.offlineTimeout
	if notif != nil {
		sec := int64(notif.GetSettings().Rules.OfflineThresholdSec)
		if sec >= 5 {
			timeout = sec
		}
	}

	h.mu.Lock()
	for nodeID, current := range h.nodeStates {
		if current.IsOnline && (now-current.LastSeen > timeout) {
			state := cloneNodeState(current)
			state.IsOnline = false
			state.RateDown = 0
			state.RateUp = 0
			state.Network.RateDownload = 0
			state.Network.RateUpload = 0
			h.nodeStates[nodeID] = state
			transitionedOffline = append(transitionedOffline, state)
		}
	}
	h.mu.Unlock()

	for _, state := range transitionedOffline {
		log.Printf("[Hub] Node %s (%s) marked OFFLINE (timeout: %ds)", state.NodeID, state.Name, timeout)
		_ = h.storage.UpsertNode(&model.NodeMetadata{
			NodeID:   state.NodeID,
			Name:     state.Name,
			Region:   state.Region,
			IsOnline: false,
			LastSeen: state.LastSeen,
		})

		h.sendBroadcast(&model.WSEvent{
			Type:      "node_offline",
			Timestamp: now,
			Data:      cloneNodeState(state),
		})

		if notif != nil {
			notif.NotifyNodeOffline(state)
		}
	}
}

func (h *Hub) sendBroadcast(event *model.WSEvent) {
	h.broadcastMu.Lock()
	defer h.broadcastMu.Unlock()
	event.Sequence = h.broadcastSeq.Add(1)
	select {
	case h.broadcastChan <- event:
	default:
		// The dashboard may have missed a node_delete or other one-time event.
		// Reconnect every client so it receives an authoritative snapshot.
		h.clientsMu.Lock()
		for q := range h.clients {
			q.Close()
			delete(h.clients, q)
		}
		h.clientsMu.Unlock()
	}
}

// RegisterClient adds a new Web Dashboard WebSocket client and sends full state
// snapshot. The returned queue owns every write to the socket and must be closed
// by the caller when the connection ends.
func (h *Hub) RegisterClient(conn *websocket.Conn) *wsWriteQueue {
	q := newWSWriteQueue(conn)

	// Read the state before admitting this queue to broadcasts. Events already
	// pending in the hub channel have a sequence at or below minSequence and
	// must not be delivered after this snapshot.
	h.mu.RLock()
	snapshot := make([]*model.NodeState, 0, len(h.nodeStates))
	for _, s := range h.nodeStates {
		snapshot = append(snapshot, cloneNodeState(s))
	}

	event := &model.WSEvent{
		Type:      "nodes_snapshot",
		Timestamp: time.Now().Unix(),
		Data:      snapshot,
	}

	payload, err := json.Marshal(event)
	if err != nil {
		h.mu.RUnlock()
		q.Close()
		return q
	}
	h.clientsMu.Lock()
	q.minSequence = h.broadcastSeq.Load()
	if q.Send(payload) {
		h.clients[q] = struct{}{}
	} else {
		q.Close()
	}
	h.clientsMu.Unlock()
	h.mu.RUnlock()
	return q
}

// UnregisterClient removes a Web Dashboard client.
func (h *Hub) UnregisterClient(q *wsWriteQueue) {
	h.clientsMu.Lock()
	delete(h.clients, q)
	h.clientsMu.Unlock()
	q.Close()
}

func (h *Hub) broadcastToClients(event *model.WSEvent) {
	payload, err := json.Marshal(event)
	if err != nil {
		return
	}

	// A client whose queue is full has missed a state transition. Close its
	// socket so the dashboard reconnects and receives a fresh snapshot.
	h.clientsMu.RLock()
	var toRemove []*wsWriteQueue
	for q := range h.clients {
		if event.Sequence <= q.minSequence {
			continue
		}
		if !q.Send(payload) {
			toRemove = append(toRemove, q)
		}
	}
	h.clientsMu.RUnlock()

	if len(toRemove) > 0 {
		h.clientsMu.Lock()
		for _, q := range toRemove {
			delete(h.clients, q)
			q.Close()
		}
		h.clientsMu.Unlock()
	}
}

// cloneNodeState returns a copy that callers may read without holding h.mu.
//
// Handing out the stored pointer lets later state transitions race with JSON
// serialization. The struct copy covers scalar and embedded value fields;
// Tags and Pings need their backing arrays copied too.
func cloneNodeState(s *model.NodeState) *model.NodeState {
	if s == nil {
		return nil
	}
	c := *s
	if s.Tags != nil {
		c.Tags = append([]string(nil), s.Tags...)
	}
	if s.Pings != nil {
		c.Pings = append([]model.PingStat(nil), s.Pings...)
	}
	return &c
}

// GetAllStates returns a snapshot of current node states, safe to read after the
// lock is released.
func (h *Hub) GetAllStates() []*model.NodeState {
	h.mu.RLock()
	defer h.mu.RUnlock()

	states := make([]*model.NodeState, 0, len(h.nodeStates))
	for _, s := range h.nodeStates {
		states = append(states, cloneNodeState(s))
	}
	return states
}

// GetNodeState returns a snapshot of one node's state.
func (h *Hub) GetNodeState(nodeID string) (*model.NodeState, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	s, exists := h.nodeStates[nodeID]
	if !exists {
		return nil, false
	}
	return cloneNodeState(s), true
}

// DeleteNode removes node from memory and storage.
func (h *Hub) DeleteNode(nodeID string) error {
	// A live agent connection is the authority on whether this node is in use.
	// Its entry clears as soon as the agent's socket ends: a clean exit
	// unregisters immediately, and a link that died silently is noticed when the
	// read deadline expires. A socket that is merely stalled keeps its entry, so
	// a node that went quiet mid-connection still cannot be deleted out from
	// under a live agent.
	//
	// The online flag is deliberately not consulted. It follows the alert
	// debounce, which defaults to a minute, so gating on it left a node that had
	// already shut down cleanly undeletable for that whole window.
	h.agentMu.RLock()
	_, connected := h.agentConns[nodeID]
	h.agentMu.RUnlock()
	if connected {
		return ErrNodeActive
	}
	h.mu.Lock()
	delete(h.nodeStates, nodeID)
	h.mu.Unlock()

	h.sendBroadcast(&model.WSEvent{
		Type:      "node_delete",
		Timestamp: time.Now().Unix(),
		Data:      map[string]string{"node_id": nodeID},
	})

	return h.storage.DeleteNode(nodeID)
}

func formatUptime(seconds uint64) string {
	days := seconds / 86400
	hours := (seconds % 86400) / 3600
	minutes := (seconds % 3600) / 60

	if days > 0 {
		return fmt.Sprintf("%dd %dh %dm", days, hours, minutes)
	}
	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	}
	return fmt.Sprintf("%dm", minutes)
}
