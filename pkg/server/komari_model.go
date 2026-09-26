package server

// KomariThemeManifest represents the metadata inside komari-theme.json.
type KomariThemeManifest struct {
	Name          interface{}            `json:"name"`        // string or map[string]string
	Short         string                 `json:"short"`       // Unique theme identifier
	Description   interface{}            `json:"description"` // string or map[string]string
	Version       string                 `json:"version"`
	Author        interface{}            `json:"author"`
	URL           string                 `json:"url,omitempty"`
	Preview       string                 `json:"preview,omitempty"`
	Configuration map[string]interface{} `json:"configuration,omitempty"`
}

// KomariThemeItem represents an installed or market theme displayed in UI.
type KomariThemeItem struct {
	Name        string                 `json:"name"`
	Short       string                 `json:"short"`
	Description string                 `json:"description"`
	Version     string                 `json:"version"`
	Author      string                 `json:"author"`
	URL         string                 `json:"url,omitempty"`
	Preview     string                 `json:"preview,omitempty"`
	IsInstalled bool                   `json:"is_installed"`
	IsActive    bool                   `json:"is_active"`
	DownloadURL string                 `json:"download,omitempty"`
	SHA256      string                 `json:"sha256,omitempty"`
	Config      map[string]interface{} `json:"configuration,omitempty"`
}

// KomariMarketPayload represents the official v1.json market structure.
type KomariMarketPayload struct {
	Schema    int                 `json:"schema"`
	UpdatedAt string              `json:"updated_at"`
	Themes    []KomariMarketTheme `json:"themes"`
}

// KomariMarketTheme is an individual entry in the Komari theme market.
type KomariMarketTheme struct {
	Name        interface{} `json:"name"`
	Short       string      `json:"short"`
	Description interface{} `json:"description"`
	Version     string      `json:"version"`
	Author      interface{} `json:"author"`
	URL         string      `json:"url,omitempty"`
	Preview     string      `json:"preview,omitempty"`
	Download    string      `json:"download"`
	SHA256      string      `json:"sha256,omitempty"`
}

// KomariPublicResponse is returned by GET /api/public.
type KomariPublicResponse struct {
	Status  string           `json:"status"`
	Message string           `json:"message"`
	Data    KomariPublicData `json:"data"`
}

// KomariPublicData contains site & theme info for Komari frontends.
type KomariPublicData struct {
	Sitename      string                 `json:"sitename"`
	Theme         string                 `json:"theme"`
	ThemeSettings map[string]interface{} `json:"theme_settings"`
	PrivateSite   bool                   `json:"private_site"`
}

// KomariClient represents the node structure returned by GET /api/nodes.
type KomariClient struct {
	UUID      string       `json:"uuid"`
	Name      string       `json:"name"`
	Group     string       `json:"group"`
	Status    int          `json:"status"` // 1: online, 0: offline
	CreatedAt string       `json:"created_at"`
	UpdatedAt string       `json:"updated_at"`
	Region    string       `json:"region"`
	Remark    string       `json:"remark,omitempty"`
	Version   string       `json:"version,omitempty"`
	System    KomariSystem `json:"system"`
	// Billing & quota. Komari themes derive 月均/日均支出, 总价值 and 剩余价值
	// from these: billing_cycle is the period length in DAYS (-1 = one-time,
	// 0 = unset), currency must be an ISO code the theme's rate table knows,
	// and expired_at serializes as null when unset.
	Price            float64     `json:"price"`
	BillingCycle     int         `json:"billing_cycle"`
	AutoRenewal      bool        `json:"auto_renewal"`
	Currency         string      `json:"currency"`
	ExpiredAt        interface{} `json:"expired_at"`
	Tags             string      `json:"tags"`
	TrafficLimit     uint64      `json:"traffic_limit"`
	TrafficLimitType string      `json:"traffic_limit_type"`
	Hidden           bool        `json:"hidden"`
	Weight           int         `json:"weight"`
}

// KomariSystem represents node static hardware inventory.
type KomariSystem struct {
	OS          string `json:"os"`
	Arch        string `json:"arch"`
	CPUName     string `json:"cpu_name"`
	CPUCores    int    `json:"cpu_cores"`
	MemoryTotal uint64 `json:"memory_total"`
	DiskTotal   uint64 `json:"disk_total"`
}

// KomariLiveNodeData represents real-time telemetry for one node inside GET /api/clients WebSocket.
type KomariLiveNodeData struct {
	CPU         KomariLiveCPU         `json:"cpu"`
	RAM         KomariLiveRAM         `json:"ram"`
	Swap        KomariLiveRAM         `json:"swap"`
	Load        KomariLiveLoad        `json:"load"`
	Disk        KomariLiveRAM         `json:"disk"`
	Network     KomariLiveNetwork     `json:"network"`
	Connections KomariLiveConnections `json:"connections"`
	Uptime      uint64                `json:"uptime"`
	Process     int                   `json:"process"`
	Message     string                `json:"message"`
	UpdatedAt   string                `json:"updated_at"`
}

type KomariLiveCPU struct {
	Name  string  `json:"name"`
	Cores int     `json:"cores"`
	Arch  string  `json:"arch"`
	Usage float64 `json:"usage"` // 0-100
}

type KomariLiveRAM struct {
	Total uint64 `json:"total"`
	Used  uint64 `json:"used"`
}

type KomariLiveLoad struct {
	Load1  float64 `json:"load1"`
	Load5  float64 `json:"load5"`
	Load15 float64 `json:"load15"`
}

type KomariLiveNetwork struct {
	Up        float64 `json:"up"`   // bytes/s
	Down      float64 `json:"down"` // bytes/s
	TotalUp   uint64  `json:"totalUp"`
	TotalDown uint64  `json:"totalDown"`
}

type KomariLiveConnections struct {
	TCP int `json:"tcp"`
	UDP int `json:"udp"`
}

// KomariClientsWSResponse is the payload sent over WebSocket /api/clients.
type KomariClientsWSResponse struct {
	Status string              `json:"status"`
	Data   KomariClientsWSData `json:"data"`
}

type KomariClientsWSData struct {
	Online []string                      `json:"online"`
	Data   map[string]KomariLiveNodeData `json:"data"`
}

// Helper to extract localized string from string or map[string]string.
func extractI18nString(v interface{}, preferredLang string) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	if m, ok := v.(map[string]interface{}); ok {
		if preferredLang != "" {
			if val, exists := m[preferredLang]; exists {
				if s, ok := val.(string); ok {
					return s
				}
			}
		}
		if val, exists := m["zh-CN"]; exists {
			if s, ok := val.(string); ok {
				return s
			}
		}
		if val, exists := m["en"]; exists {
			if s, ok := val.(string); ok {
				return s
			}
		}
		for _, val := range m {
			if s, ok := val.(string); ok {
				return s
			}
		}
	}
	return ""
}

// JSONRPCRequest represents a JSON-RPC 2.0 request.
type JSONRPCRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
	ID      interface{} `json:"id,omitempty"`
}

// JSONRPCResponse represents a JSON-RPC 2.0 response.
type JSONRPCResponse struct {
	JSONRPC string        `json:"jsonrpc"`
	Result  interface{}   `json:"result,omitempty"`
	Error   *JSONRPCError `json:"error,omitempty"`
	ID      interface{}   `json:"id,omitempty"`
}

// JSONRPCError represents a JSON-RPC 2.0 error object.
type JSONRPCError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// KomariRpcNode represents a node in common:getNodes for modern Komari themes.
type KomariRpcNode struct {
	UUID             string      `json:"uuid"`
	Name             string      `json:"name"`
	CPUName          string      `json:"cpu_name"`
	Virtualization   string      `json:"virtualization"`
	Arch             string      `json:"arch"`
	CPUCores         int         `json:"cpu_cores"`
	OS               string      `json:"os"`
	KernelVersion    string      `json:"kernel_version"`
	GPUName          string      `json:"gpu_name"`
	Region           string      `json:"region"`
	MemTotal         uint64      `json:"mem_total"`
	SwapTotal        uint64      `json:"swap_total"`
	DiskTotal        uint64      `json:"disk_total"`
	Version          string      `json:"version"`
	Weight           int         `json:"weight"`
	Price            float64     `json:"price"`
	Tags             string      `json:"tags"`
	BillingCycle     int         `json:"billing_cycle"`
	Currency         string      `json:"currency"`
	Group            string      `json:"group"`
	TrafficLimit     uint64      `json:"traffic_limit"`
	TrafficLimitType string      `json:"traffic_limit_type"`
	ExpiredAt        interface{} `json:"expired_at"` // null when unset
	CreatedAt        string      `json:"created_at"`
	UpdatedAt        string      `json:"updated_at"`
	IPv4             string      `json:"ipv4"`
	IPv6             string      `json:"ipv6"`
	PublicRemark     string      `json:"public_remark"`
}

// KomariRpcNodeStatus represents live node telemetry for common:getNodesLatestStatus.
type KomariRpcNodeStatus struct {
	Client         string  `json:"client"`
	Online         bool    `json:"online"`
	CPU            float64 `json:"cpu"`
	RAM            uint64  `json:"ram"`
	Swap           uint64  `json:"swap"`
	Load           float64 `json:"load"`
	Load5          float64 `json:"load5"`
	Load15         float64 `json:"load15"`
	Disk           uint64  `json:"disk"`
	NetIn          float64 `json:"net_in"`
	NetOut         float64 `json:"net_out"`
	NetTotalUp     uint64  `json:"net_total_up"`
	NetTotalDown   uint64  `json:"net_total_down"`
	Connections    int     `json:"connections"`
	ConnectionsUDP int     `json:"connections_udp"`
	Uptime         uint64  `json:"uptime"`
	Process        int     `json:"process"`
	// Time is RFC3339: themes construct Date objects from it directly, and an
	// epoch-seconds number read as milliseconds lands in January 1970.
	Time string `json:"time"`
}

// KomariPingTask represents a ping monitoring task in Komari format.
type KomariPingTask struct {
	ID        int64    `json:"id"`
	Weight    int      `json:"weight"`
	Name      string   `json:"name"`
	Clients   []string `json:"clients"`
	DefaultOn bool     `json:"default_on"`
	Type      string   `json:"type"`
	Interval  int      `json:"interval"`
}
