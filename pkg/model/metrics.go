package model

// NodeReport represents the standard metric report payload sent from Agent to Server.
type NodeReport struct {
	NodeID    string      `json:"node_id"`
	Token     string      `json:"token"`
	Timestamp int64       `json:"timestamp"` // Unix timestamp in seconds
	Name      string      `json:"name,omitempty"`
	Region    string      `json:"region,omitempty"`
	Tags      []string    `json:"tags,omitempty"`
	Billing   BillingInfo `json:"billing,omitempty"`
	System    SystemInfo  `json:"system"`
	Network   NetworkInfo `json:"network"`
	Pings     []PingStat  `json:"pings,omitempty"`
}

// PingStat represents latency, packet loss, and jitter to a monitored target.
type PingStat struct {
	ID         int64   `json:"id,omitempty"`
	Target     string  `json:"target"`      // e.g. "8.8.8.8" or "www.google.com"
	Label      string  `json:"label"`       // e.g. "Google", "电信", "Youtube", "ChatGPT", "Claude"
	Color      string  `json:"color"`       // Visual indicator color (hex or tailwind)
	LatencyMs  float64 `json:"latency_ms"`  // e.g. 1.2
	PacketLoss float64 `json:"packet_loss"` // e.g. 0.00 (%)
	Jitter     float64 `json:"jitter"`      // e.g. 0.15
}

// BillingInfo contains VPS billing cycle, pricing, and expiration telemetry.
type BillingInfo struct {
	Price         float64 `json:"price"`
	PricePerMonth float64 `json:"price_per_month"`
	Currency      string  `json:"currency"`      // "$", "¥", "€", "£", "HK$"
	BillingCycle  string  `json:"billing_cycle"` // "month", "quarter", "half_year", "year", "two_year", "three_year"
	ExpiryDate    string  `json:"expiry_date"`   // e.g. "2026-10-15"
	// RemainingDays is 0 when no expiry date is configured — it is not a
	// default cycle length. Read 0 as "未设到期", never as "30 days left".
	RemainingDays int `json:"remaining_days"`
	// RemainingValue is the unconsumed value converted to the base currency
	// (CNY). Admin totals sum this field and only this field.
	RemainingValue float64 `json:"remaining_value"`
	// RemainingValueNative is the same quantity in the node's own Currency,
	// which is what the per-node cards display.
	RemainingValueNative float64 `json:"remaining_value_native"`
	BandwidthQuota       uint64  `json:"bandwidth_quota"` // Total allowed bytes; 0 means unset/unlimited
	// BandwidthUsed is the effective consumed bytes: the operator's calibration
	// baseline plus everything the agent has counted since it was anchored.
	BandwidthUsed uint64 `json:"bandwidth_used"`
	// BandwidthLive is the raw interface counter (bytes since boot) behind
	// BandwidthUsed. Exposed so the UI can offer "sync to live" and "clear
	// calibration" without re-deriving it from the network block.
	BandwidthLive uint64 `json:"bandwidth_live"`
	Provider      string `json:"provider"` // e.g. "Zillion Network Inc. · AS54801"
	AutoRenewal   bool   `json:"auto_renewal"`
	Note          string `json:"note,omitempty"` // e.g. "续费折扣码: PROMO60"
}

// PingTargetConfig defines a ping target for network quality detection.
type PingTargetConfig struct {
	ID        int64    `json:"id"`
	Label     string   `json:"label"`
	Target    string   `json:"target"`
	Color     string   `json:"color"`
	Protocol  string   `json:"protocol"` // "icmp", "tcp", "http"
	Port      int      `json:"port"`
	Interval  int      `json:"interval"`   // Detection interval in seconds (e.g. 60)
	Servers   []string `json:"servers"`    // Targeted node IDs (empty slice means all servers)
	AutoStart bool     `json:"auto_start"` // Whether newly added nodes auto-monitor this
	// AssignedServers freezes the existing node set when AutoStart is disabled
	// and Servers is empty. It is internal to the server, not an API field.
	AssignedServers []string `json:"-"`
	Enabled         bool     `json:"enabled"`
	CreatedAt       int64    `json:"created_at"`
}

// NodeSettings contains user-configured billing details and overrides.
type NodeSettings struct {
	NodeID   string   `json:"node_id"`
	Name     string   `json:"name,omitempty"`
	Region   string   `json:"region,omitempty"`
	Tags     []string `json:"tags,omitempty"`
	Provider string   `json:"provider,omitempty"`
	// PublicIP / PublicIPv6 are the operator's authoritative correction of what
	// the agent reported. When set they win over both the agent's own detection
	// and the address the server saw the agent connect from.
	PublicIP       string  `json:"public_ip,omitempty"`
	PublicIPv6     string  `json:"public_ipv6,omitempty"`
	Price          float64 `json:"price"`
	Currency       string  `json:"currency"`
	BillingCycle   string  `json:"billing_cycle"`
	ExpiryDate     string  `json:"expiry_date"`
	BandwidthQuota uint64  `json:"bandwidth_quota"` // Total allowed bytes; 0 means unset
	// BandwidthUsed is the operator's calibration baseline, not a live reading:
	// traffic counted after BandwidthBaseCounter was taken is added on top of
	// it. 0 clears the calibration and reverts the node to its live counter.
	BandwidthUsed uint64 `json:"bandwidth_used"`
	// BandwidthBaseCounter is the interface counter reading that BandwidthUsed
	// corresponds to. 0 means "not anchored yet" — the server anchors it to the
	// first counter it sees, so a calibration saved while the node was offline
	// still starts counting from the right place.
	BandwidthBaseCounter uint64 `json:"bandwidth_base_counter"`
	AutoRenewal          bool   `json:"auto_renewal"`
	Note                 string `json:"note,omitempty"`
	UpdatedAt            int64  `json:"updated_at"`
}

// SystemSettings contains exchange rates and currency configuration.
type SystemSettings struct {
	BaseCurrency   string             `json:"base_currency"`  // "CNY" or "USD"
	ExchangeRates  map[string]float64 `json:"exchange_rates"` // {"USD": 7.12, "EUR": 7.76, "HKD": 0.91, "GBP": 9.35, "JPY": 0.048}
	LastRateUpdate int64              `json:"last_rate_update"`
}

// SystemInfo contains system-level telemetry and hardware inventory.
type SystemInfo struct {
	OS     string `json:"os"`
	Kernel string `json:"kernel"`
	// AgentVersion is the build version of the agent that produced this report.
	// Empty means either the agent predates the field or the build carried no
	// stamp, and the dashboard reads that absence as "unknown, probably old".
	AgentVersion   string `json:"agent_version,omitempty"`
	Uptime         uint64 `json:"uptime"`
	CPUModel       string `json:"cpu_model"`
	CPUMark        string `json:"cpu_mark"`       // e.g. "中端服务器级"
	Virtualization string `json:"virtualization"` // e.g. "kvm", "docker"
	// PublicIP / PublicIPv6 are what the agent detected as its own egress
	// address. Either may be empty — a host with no IPv6 connectivity reports
	// none, and an agent that cannot reach a lookup service reports neither.
	// The dashboard renders an empty value as unknown rather than substituting
	// a placeholder.
	PublicIP     string  `json:"public_ip"`
	PublicIPv6   string  `json:"public_ipv6"`
	CPUPercent   float64 `json:"cpu_percent"`
	CPUCount     int     `json:"cpu_count"`
	MemUsed      uint64  `json:"mem_used"`
	MemTotal     uint64  `json:"mem_total"`
	SwapUsed     uint64  `json:"swap_used"`
	SwapTotal    uint64  `json:"swap_total"`
	DiskPercent  float64 `json:"disk_percent"`
	DiskUsed     uint64  `json:"disk_used"`
	DiskTotal    uint64  `json:"disk_total"`
	Load1        float64 `json:"load_1"`
	Load5        float64 `json:"load_5"`
	Load15       float64 `json:"load_15"`
	ProcessCount int     `json:"process_count"`
}

// NetworkInfo contains egress/ingress bandwidth, connections, and monthly peaks.
type NetworkInfo struct {
	BytesSent       uint64  `json:"bytes_sent"`
	BytesRecv       uint64  `json:"bytes_recv"`
	TCPEstablished  int     `json:"tcp_established"`
	UDPEstablished  int     `json:"udp_established"`
	RateUpload      float64 `json:"rate_upload"`       // bytes/s
	RateDownload    float64 `json:"rate_download"`     // bytes/s
	MonthlyPeakDown float64 `json:"monthly_peak_down"` // bytes/s
	MonthlyPeakUp   float64 `json:"monthly_peak_up"`   // bytes/s
}

// NodeState represents the live in-memory state of a node maintained by the Hub.
type NodeState struct {
	NodeID    string      `json:"node_id"`
	Name      string      `json:"name"`
	Region    string      `json:"region"`
	Tags      []string    `json:"tags"`
	Billing   BillingInfo `json:"billing"`
	IsOnline  bool        `json:"is_online"`
	LastSeen  int64       `json:"last_seen"`
	System    SystemInfo  `json:"system"`
	Network   NetworkInfo `json:"network"`
	Pings     []PingStat  `json:"pings"`
	CPU       float64     `json:"cpu"`       // 0-100
	Mem       float64     `json:"mem"`       // 0-100
	Swap      float64     `json:"swap"`      // 0-100
	Disk      float64     `json:"disk"`      // 0-100
	RateDown  float64     `json:"rate_down"` // bytes/s
	RateUp    float64     `json:"rate_up"`   // bytes/s
	UptimeStr string      `json:"uptime_str"`
}

// HistoryPoint represents downsampled telemetry points stored in SQLite for the 6 charts.
type HistoryPoint struct {
	NodeID       string  `json:"node_id"`
	Timestamp    int64   `json:"timestamp"`
	CPUPercent   float64 `json:"cpu_percent"`
	Load1        float64 `json:"load_1"`
	MemUsed      uint64  `json:"mem_used"`
	MemTotal     uint64  `json:"mem_total"`
	SwapUsed     uint64  `json:"swap_used"`
	SwapTotal    uint64  `json:"swap_total"`
	DiskUsed     uint64  `json:"disk_used"`
	DiskTotal    uint64  `json:"disk_total"`
	RateDownload float64 `json:"rate_download"`
	RateUpload   float64 `json:"rate_upload"`
	TCPCount     int     `json:"tcp_count"`
	UDPCount     int     `json:"udp_count"`
	ProcessCount int     `json:"process_count"`
}

// PingHistoryPoint represents downsampled ping latency & loss.
type PingHistoryPoint struct {
	NodeID     string  `json:"node_id"`
	Timestamp  int64   `json:"timestamp"`
	Target     string  `json:"target"`
	Label      string  `json:"label"`
	LatencyMs  float64 `json:"latency_ms"`
	PacketLoss float64 `json:"packet_loss"`
}

// NodeMetadata represents registered node information in the database.
type NodeMetadata struct {
	NodeID string `json:"node_id"`
	Name   string `json:"name"`
	Token  string `json:"token"`
	Region string `json:"region"`
	Tags   string `json:"tags"` // JSON string
	OS     string `json:"os"`
	Kernel string `json:"kernel"`
	// PublicIP / PublicIPv6 persist the last address the agent reported, so a
	// node that is offline (or a server that just restarted) still shows the
	// address it had instead of blanking the field.
	PublicIP   string `json:"public_ip"`
	PublicIPv6 string `json:"public_ipv6"`
	// AgentVersion persists with the node so a restarted server can still show
	// which build a host was last running, before that host reconnects.
	AgentVersion string `json:"agent_version"`
	CreatedAt    int64  `json:"created_at"`
	LastSeen     int64  `json:"last_seen"`
	IsOnline     bool   `json:"is_online"`
}

// WSEvent is the message wrapper broadcast over WebSocket.
type WSEvent struct {
	Type      string      `json:"type"`
	Timestamp int64       `json:"timestamp"`
	Data      interface{} `json:"data"`
	Sequence  uint64      `json:"-"`
}

// NotificationSettings defines channel credentials and alerting rules.
type NotificationSettings struct {
	Telegram  TelegramConfig    `json:"telegram"`
	Webhook   WebhookConfig     `json:"webhook"`
	Discord   DiscordConfig     `json:"discord"`
	Rules     NotificationRules `json:"rules"`
	UpdatedAt int64             `json:"updated_at"`
}

// TelegramConfig defines Telegram bot integration.
type TelegramConfig struct {
	Enabled  bool   `json:"enabled"`
	BotToken string `json:"bot_token"`
	ChatID   string `json:"chat_id"`
}

// WebhookConfig defines generic and popular webhook platforms.
type WebhookConfig struct {
	Enabled bool   `json:"enabled"`
	URL     string `json:"url"`
	Secret  string `json:"secret,omitempty"`
	Format  string `json:"format"` // "generic", "feishu", "dingtalk", "wecom", "bark"
}

// DiscordConfig defines Discord channel webhook.
type DiscordConfig struct {
	Enabled    bool   `json:"enabled"`
	WebhookURL string `json:"webhook_url"`
}

// NotificationRules defines thresholds and schedules.
type NotificationRules struct {
	OfflineAlert        bool   `json:"offline_alert"`
	OfflineThresholdSec int    `json:"offline_threshold_sec"` // e.g. 30, 60, 120
	RecoveryAlert       bool   `json:"recovery_alert"`
	TrafficAlert        bool   `json:"traffic_alert"`
	TrafficThresholdPct int    `json:"traffic_threshold_pct"` // e.g. 80, 90
	DailyReport         bool   `json:"daily_report"`
	DailyReportTime     string `json:"daily_report_time"` // "09:00"
}

// NotificationLog records sent notification history.
type NotificationLog struct {
	ID        int64  `json:"id"`
	Timestamp int64  `json:"timestamp"`
	Channel   string `json:"channel"` // "telegram", "webhook", "discord"
	Type      string `json:"type"`    // "offline", "recovery", "traffic", "daily_report", "test"
	Title     string `json:"title"`
	Content   string `json:"content"`
	Status    string `json:"status"` // "success", "failed"
	ErrorMsg  string `json:"error_msg,omitempty"`
}
