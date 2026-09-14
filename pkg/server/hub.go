package server

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"

	"probe/pkg/model"

	"github.com/gorilla/websocket"
)

var (
	geoIPCache sync.Map // map[string]string (IP -> CountryCode)
)

// resolveIPRegion queries IP geolocation service with caching and timeouts.
func resolveIPRegion(ip string) string {
	ip = strings.TrimSpace(ip)
	if ip == "" || ip == "127.0.0.1" || ip == "::1" || strings.HasPrefix(ip, "192.168.") || strings.HasPrefix(ip, "10.") || strings.HasPrefix(ip, "172.") {
		return "LOCAL"
	}

	if val, ok := geoIPCache.Load(ip); ok {
		return val.(string)
	}

	client := &http.Client{Timeout: 1500 * time.Millisecond}

	// Try ip-api.com
	if resp, err := client.Get("http://ip-api.com/line/" + ip + "?fields=countryCode"); err == nil {
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		if scanner.Scan() {
			code := strings.TrimSpace(scanner.Text())
			if len(code) == 2 {
				code = strings.ToUpper(code)
				geoIPCache.Store(ip, code)
				return code
			}
		}
	}

	// Try api.country.is
	if resp, err := client.Get("https://api.country.is/" + ip); err == nil {
		defer resp.Body.Close()
		var res struct {
			Country string `json:"country"`
		}
		if json.NewDecoder(resp.Body).Decode(&res) == nil && len(res.Country) == 2 {
			code := strings.ToUpper(res.Country)
			geoIPCache.Store(ip, code)
			return code
		}
	}

	return "GLOBAL"
}

// Hub manages purely in-memory node states and real-time event broadcasting to Web clients.
type Hub struct {
	storage     *Storage
	downsampler *Downsampler

	mu         sync.RWMutex
	nodeStates map[string]*model.NodeState

	clientsMu sync.RWMutex
	clients   map[*websocket.Conn]bool

	settingsMu    sync.RWMutex
	nodeSettings  map[string]*model.NodeSettings
	ratesMu       sync.RWMutex
	exchangeRates map[string]float64

	agentMu    sync.RWMutex
	agentConns map[string]*websocket.Conn

	broadcastChan  chan *model.WSEvent
	offlineTimeout int64 // in seconds, e.g. 6s
}

// NewHub initializes the in-memory Hub.
func NewHub(storage *Storage, downsampler *Downsampler) *Hub {
	h := &Hub{
		storage:        storage,
		downsampler:    downsampler,
		nodeStates:     make(map[string]*model.NodeState),
		clients:        make(map[*websocket.Conn]bool),
		nodeSettings:   make(map[string]*model.NodeSettings),
		exchangeRates:  map[string]float64{"USD": 7.18, "EUR": 7.82, "HKD": 0.92, "GBP": 9.35, "JPY": 0.048},
		agentConns:     make(map[string]*websocket.Conn),
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
					OS:     n.OS,
					Kernel: n.Kernel,
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
func (h *Hub) RegisterAgent(nodeID string, conn *websocket.Conn) {
	h.agentMu.Lock()
	h.agentConns[nodeID] = conn
	h.agentMu.Unlock()

	h.syncPingTargetsToAgent(conn)
}

// UnregisterAgent removes an agent connection.
func (h *Hub) UnregisterAgent(nodeID string) {
	h.agentMu.Lock()
	delete(h.agentConns, nodeID)
	h.agentMu.Unlock()
}

// BroadcastPingTargetsSync pushes active targets to all connected agents.
func (h *Hub) BroadcastPingTargetsSync() {
	targets, err := h.storage.GetPingTargets()
	if err != nil {
		return
	}
	var active []model.PingTargetConfig
	for _, t := range targets {
		if t.Enabled {
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
		return
	}

	h.agentMu.RLock()
	defer h.agentMu.RUnlock()
	for _, conn := range h.agentConns {
		_ = conn.WriteMessage(websocket.TextMessage, payload)
	}
}

func (h *Hub) syncPingTargetsToAgent(conn *websocket.Conn) {
	targets, err := h.storage.GetPingTargets()
	if err != nil {
		return
	}
	var active []model.PingTargetConfig
	for _, t := range targets {
		if t.Enabled {
			active = append(active, t)
		}
	}

	payload, err := json.Marshal(map[string]interface{}{
		"type": "config_sync",
		"data": map[string]interface{}{
			"ping_targets": active,
		},
	})
	if err == nil {
		_ = conn.WriteMessage(websocket.TextMessage, payload)
	}
}

// IngestReport processes an incoming metric payload from an Agent.
func (h *Hub) IngestReport(report *model.NodeReport) {
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
	if region == "" || strings.EqualFold(region, "auto") || strings.EqualFold(region, "default") {
		ip := strings.TrimSpace(report.System.PublicIP)
		if ip != "" && ip != "127.0.0.1" && ip != "::1" {
			if cached, ok := geoIPCache.Load(ip); ok {
				region = cached.(string)
			} else {
				region = "AUTO"
				go func(nodeID, targetIP string) {
					detected := resolveIPRegion(targetIP)
					if detected != "" && detected != "GLOBAL" {
						h.mu.Lock()
						if st, found := h.nodeStates[nodeID]; found {
							if st.Region == "" || strings.EqualFold(st.Region, "auto") || strings.EqualFold(st.Region, "default") || strings.EqualFold(st.Region, "global") {
								st.Region = detected
								_ = h.storage.UpsertNode(&model.NodeMetadata{
									NodeID:   st.NodeID,
									Name:     st.Name,
									Region:   st.Region,
									OS:       st.System.OS,
									Kernel:   st.System.Kernel,
									IsOnline: true,
								})
								h.sendBroadcast(&model.WSEvent{
									Type:      "node_update",
									Timestamp: time.Now().Unix(),
									Data:      st,
								})
							}
						}
						h.mu.Unlock()
					}
				}(report.NodeID, ip)
			}
		} else {
			region = "LOCAL"
		}
	}
	tags := report.Tags
	billing := report.Billing

	// Apply node settings overrides if configured
	h.settingsMu.RLock()
	settings, hasSettings := h.nodeSettings[report.NodeID]
	h.settingsMu.RUnlock()

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
		if settings.BandwidthUsed > 0 {
			billing.BandwidthUsed = settings.BandwidthUsed
		}
		billing.AutoRenewal = settings.AutoRenewal
	}

	if billing.BandwidthUsed == 0 {
		billing.BandwidthUsed = report.Network.BytesSent + report.Network.BytesRecv
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
	h.nodeStates[report.NodeID] = state
	h.mu.Unlock()

	// Update SQLite node metadata asynchronously
	go func() {
		_ = h.storage.UpsertNode(&model.NodeMetadata{
			NodeID:   report.NodeID,
			Name:     name,
			Token:    report.Token,
			Region:   region,
			OS:       report.System.OS,
			Kernel:   report.System.Kernel,
			IsOnline: true,
			LastSeen: now,
		})
	}()

	// Ingest into downsampler for historical persistence
	h.downsampler.RecordIngest(report)

	// Broadcast update to all Web clients
	h.sendBroadcast(&model.WSEvent{
		Type:      "node_update",
		Timestamp: now,
		Data:      state,
	})
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

	// Calculate remaining days if ExpiryDate is set
	if billing.ExpiryDate != "" {
		if t, err := time.Parse("2006-01-02", billing.ExpiryDate); err == nil {
			now := time.Now()
			t = t.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
			diff := t.Sub(now)
			if diff > 0 {
				billing.RemainingDays = int(diff.Hours() / 24)
			} else {
				billing.RemainingDays = 0
			}
		}
	} else if billing.RemainingDays == 0 {
		billing.RemainingDays = 30
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

	billing.RemainingValue = math.Round(remainingNative*rate*100) / 100
}

// checkOfflineNodes checks for nodes that haven't sent a heartbeat within the timeout.
func (h *Hub) checkOfflineNodes() {
	now := time.Now().Unix()
	var transitionedOffline []*model.NodeState

	h.mu.Lock()
	for _, state := range h.nodeStates {
		if state.IsOnline && (now-state.LastSeen > h.offlineTimeout) {
			state.IsOnline = false
			state.RateDown = 0
			state.RateUp = 0
			state.Network.RateDownload = 0
			state.Network.RateUpload = 0
			transitionedOffline = append(transitionedOffline, state)
		}
	}
	h.mu.Unlock()

	for _, state := range transitionedOffline {
		log.Printf("[Hub] Node %s (%s) marked OFFLINE (timeout: %ds)", state.NodeID, state.Name, h.offlineTimeout)
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
			Data:      state,
		})
	}
}

func (h *Hub) sendBroadcast(event *model.WSEvent) {
	select {
	case h.broadcastChan <- event:
	default:
		// Queue full, drop event to keep server non-blocking
	}
}

// RegisterClient adds a new Web Dashboard WebSocket client and sends full state snapshot.
func (h *Hub) RegisterClient(conn *websocket.Conn) {
	h.clientsMu.Lock()
	h.clients[conn] = true
	h.clientsMu.Unlock()

	// Immediately send snapshot of all nodes
	h.mu.RLock()
	snapshot := make([]*model.NodeState, 0, len(h.nodeStates))
	for _, s := range h.nodeStates {
		snapshot = append(snapshot, s)
	}
	h.mu.RUnlock()

	event := &model.WSEvent{
		Type:      "nodes_snapshot",
		Timestamp: time.Now().Unix(),
		Data:      snapshot,
	}

	payload, err := json.Marshal(event)
	if err == nil {
		_ = conn.WriteMessage(websocket.TextMessage, payload)
	}
}

// UnregisterClient removes a Web Dashboard client.
func (h *Hub) UnregisterClient(conn *websocket.Conn) {
	h.clientsMu.Lock()
	delete(h.clients, conn)
	h.clientsMu.Unlock()
	_ = conn.Close()
}

func (h *Hub) broadcastToClients(event *model.WSEvent) {
	payload, err := json.Marshal(event)
	if err != nil {
		return
	}

	h.clientsMu.RLock()
	var toRemove []*websocket.Conn
	for conn := range h.clients {
		_ = conn.SetWriteDeadline(time.Now().Add(3 * time.Second))
		if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
			toRemove = append(toRemove, conn)
		}
	}
	h.clientsMu.RUnlock()

	if len(toRemove) > 0 {
		h.clientsMu.Lock()
		for _, conn := range toRemove {
			delete(h.clients, conn)
			_ = conn.Close()
		}
		h.clientsMu.Unlock()
	}
}

// GetAllStates returns a slice of current node states.
func (h *Hub) GetAllStates() []*model.NodeState {
	h.mu.RLock()
	defer h.mu.RUnlock()

	states := make([]*model.NodeState, 0, len(h.nodeStates))
	for _, s := range h.nodeStates {
		states = append(states, s)
	}
	return states
}

// GetNodeState returns state for a single node.
func (h *Hub) GetNodeState(nodeID string) (*model.NodeState, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	s, exists := h.nodeStates[nodeID]
	return s, exists
}

// DeleteNode removes node from memory and storage.
func (h *Hub) DeleteNode(nodeID string) error {
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
