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
	Price          float64 `json:"price"`
	PricePerMonth  float64 `json:"price_per_month"`
	Currency       string  `json:"currency"`        // "$", "¥", "€", "£", "HK$"
	BillingCycle   string  `json:"billing_cycle"`   // "month", "quarter", "half_year", "year", "two_year", "three_year"
	ExpiryDate     string  `json:"expiry_date"`     // e.g. "2026-10-15"
	RemainingDays  int     `json:"remaining_days"`  // e.g. 27
	RemainingValue float64 `json:"remaining_value"` // e.g. 59.84
	BandwidthQuota uint64  `json:"bandwidth_quota"` // Total allowed bytes (e.g. 2 * 1024^4 = 2TB)
	BandwidthUsed  uint64  `json:"bandwidth_used"`  // Configured or live consumed bytes
	Provider       string  `json:"provider"`        // e.g. "Zillion Network Inc. · AS54801"
	AutoRenewal    bool    `json:"auto_renewal"`
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
	NodeID         string   `json:"node_id"`
	Name           string   `json:"name,omitempty"`
	Region         string   `json:"region,omitempty"`
	Tags           []string `json:"tags,omitempty"`
	Provider       string   `json:"provider,omitempty"`
	PublicIP       string   `json:"public_ip,omitempty"`
	Price          float64  `json:"price"`
	Currency       string   `json:"currency"`
	BillingCycle   string   `json:"billing_cycle"`
	ExpiryDate     string   `json:"expiry_date"`
	BandwidthQuota uint64   `json:"bandwidth_quota"` // Total allowed bytes
	BandwidthUsed  uint64   `json:"bandwidth_used"`  // Used bytes override/calibration
	AutoRenewal    bool     `json:"auto_renewal"`
	UpdatedAt      int64    `json:"updated_at"`
}

// SystemSettings contains exchange rates and currency configuration.
type SystemSettings struct {
	BaseCurrency   string             `json:"base_currency"`  // "CNY" or "USD"
	ExchangeRates  map[string]float64 `json:"exchange_rates"` // {"USD": 7.12, "EUR": 7.76, "HKD": 0.91, "GBP": 9.35, "JPY": 0.048}
	LastRateUpdate int64              `json:"last_rate_update"`
}

// SystemInfo contains system-level telemetry and hardware inventory.
type SystemInfo struct {
	OS             string  `json:"os"`
	Kernel         string  `json:"kernel"`
	Uptime         uint64  `json:"uptime"`
	CPUModel       string  `json:"cpu_model"`
	CPUMark        string  `json:"cpu_mark"`       // e.g. "中端服务器级"
	Virtualization string  `json:"virtualization"` // e.g. "kvm", "docker"
	PublicIP       string  `json:"public_ip"`
	CPUPercent     float64 `json:"cpu_percent"`
	CPUCount       int     `json:"cpu_count"`
	MemUsed        uint64  `json:"mem_used"`
	MemTotal       uint64  `json:"mem_total"`
	SwapUsed       uint64  `json:"swap_used"`
	SwapTotal      uint64  `json:"swap_total"`
	DiskPercent    float64 `json:"disk_percent"`
	DiskUsed       uint64  `json:"disk_used"`
	DiskTotal      uint64  `json:"disk_total"`
	Load1          float64 `json:"load_1"`
	Load5          float64 `json:"load_5"`
	Load15         float64 `json:"load_15"`
	ProcessCount   int     `json:"process_count"`
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
	NodeID    string `json:"node_id"`
	Name      string `json:"name"`
	Token     string `json:"token"`
	Region    string `json:"region"`
	Tags      string `json:"tags"` // JSON string
	OS        string `json:"os"`
	Kernel    string `json:"kernel"`
	CreatedAt int64  `json:"created_at"`
	LastSeen  int64  `json:"last_seen"`
	IsOnline  bool   `json:"is_online"`
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
