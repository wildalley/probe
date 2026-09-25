package server

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"probe/pkg/model"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// setupKomariRoutes registers Komari-compatible HTTP and WebSocket endpoints.
func (s *Server) setupKomariRoutes(tm *ThemeManager) {
	// Public Komari REST APIs
	s.router.GET("/api/public", s.handleKomariPublic(tm))
	s.router.GET("/api/nodes", s.handleKomariNodes)
	s.router.GET("/api/version", s.handleKomariVersion)
	s.router.GET("/api/me", s.handleKomariMe)
	s.router.POST("/api/login", s.handleKomariLogin)
	s.router.GET("/api/logout", s.handleKomariLogout)
	s.router.POST("/api/logout", s.handleKomariLogout)
	s.router.GET("/api/records/load", s.handleKomariRecordsLoad)
	s.router.GET("/api/records/ping", s.handleKomariRecordsPing)
	s.router.GET("/api/task/ping", s.handleKomariTaskPing)

	// Komari Live Telemetry WebSocket
	s.router.GET("/api/clients", s.handleKomariClientsWS)

	// Recent status history (modern Komari themes poll this for the
	// instance-page monitor charts instead of the live WebSocket).
	s.router.GET("/api/recent/:uuid", s.handleKomariRecent)

	// Komari JSON-RPC 2.0 (Theme Transport: WebSocket & HTTP)
	s.router.GET("/api/rpc2", s.handleKomariRPC2GET)
	s.router.POST("/api/rpc2", s.handleKomariRPC2POST)

	// Additional Komari theme compatibility endpoints
	s.router.GET("/api/admin/client/list", s.handleKomariAdminClientList)
	s.router.GET("/api/admin/database/size", s.handleKomariAdminDBSize)

	// Theme Static Assets (/themes/*)
	s.router.Static("/themes", tm.themesDir)

	// Flag & OS Logo Asset Resolvers (for themes like emerald-globe-pro)
	s.router.GET("/assets/flags/*filepath", s.handleFlagAsset(tm))
	s.router.HEAD("/assets/flags/*filepath", s.handleFlagAsset(tm))
	s.router.GET("/assets/flags-4x3/*filepath", s.handleFlagAsset(tm))
	s.router.HEAD("/assets/flags-4x3/*filepath", s.handleFlagAsset(tm))
	s.router.GET("/assets/logo/*filepath", s.handleLogoAsset(tm))
	s.router.HEAD("/assets/logo/*filepath", s.handleLogoAsset(tm))

	// Theme Management REST APIs (Probe Admin)
	themeGroup := s.router.Group("/api/v1/themes")
	{
		themeGroup.GET("", s.handleListThemes(tm))
		themeGroup.POST("/active", s.requireAuth(), s.handleSetActiveTheme(tm))
		themeGroup.GET("/market", s.handleGetThemeMarket(tm))
		themeGroup.POST("/install", s.requireAuth(), s.handleInstallTheme(tm))
		themeGroup.POST("/upload", s.requireAuth(), s.handleUploadTheme(tm))
		themeGroup.DELETE("/:short", s.requireAuth(), s.handleDeleteTheme(tm))
	}
}

// GET /api/public
func (s *Server) handleKomariPublic(tm *ThemeManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		activeTheme := "builtin"
		themeSettings := map[string]interface{}{}
		if tm != nil {
			activeTheme = tm.GetActiveTheme()
			themeSettings = tm.GetThemeSettings(activeTheme)
		}

		c.JSON(http.StatusOK, KomariPublicResponse{
			Status:  "success",
			Message: "",
			Data: KomariPublicData{
				Sitename:      "Cyber Probe",
				Theme:         activeTheme,
				ThemeSettings: themeSettings,
				PrivateSite:   s.privateMode,
			},
		})
	}
}

// GET /api/nodes
func (s *Server) handleKomariNodes(c *gin.Context) {
	nodes := s.hub.GetAllStates()
	list := make([]KomariClient, 0, len(nodes))

	for _, n := range nodes {
		status := 0
		if n.IsOnline {
			status = 1
		}

		createdStr := time.Unix(n.LastSeen, 0).UTC().Format(time.RFC3339)
		updatedStr := createdStr

		cpuName := n.System.CPUModel
		if cpuName == "" {
			cpuName = "Standard CPU"
		}
		cpuCores := n.System.CPUCount
		if cpuCores <= 0 {
			cpuCores = 1
		}

		list = append(list, KomariClient{
			UUID:      n.NodeID,
			Name:      n.Name,
			Group:     "Default",
			Status:    status,
			CreatedAt: createdStr,
			UpdatedAt: updatedStr,
			Region:    n.Region,
			Remark:    n.Billing.Provider,
			Version:   n.System.AgentVersion,
			System: KomariSystem{
				OS:          n.System.OS,
				Arch:        "x86_64",
				CPUName:     cpuName,
				CPUCores:    cpuCores,
				MemoryTotal: n.System.MemTotal,
				DiskTotal:   n.System.DiskTotal,
			},
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "",
		"data":    list,
	})
}

// GET /api/version
func (s *Server) handleKomariVersion(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "",
		"data": gin.H{
			"version": "1.0.5",
			"hash":    "probe",
		},
	})
}

// GET /api/me
func (s *Server) handleKomariMe(c *gin.Context) {
	token := extractSessionToken(c)
	if token != "" {
		if username, ok := s.auth.Validate(token); ok {
			c.JSON(http.StatusOK, gin.H{
				"username":    username,
				"logged_in":   true,
				"uuid":        username,
				"sso_type":    "",
				"sso_id":      "",
				"2fa_enabled": false,
			})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"username":  "Guest",
		"logged_in": false,
	})
}

// POST /api/login
func (s *Server) handleKomariLogin(c *gin.Context) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "message": "Invalid request"})
		return
	}

	token, mustChange, err := s.auth.Login(body.Username, body.Password, c.ClientIP(), c.GetHeader("User-Agent"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"status": "error", "message": err.Error()})
		return
	}

	setSessionCookie(c, token, s.auth.sessionTTL)
	// Also set Komari's standard session_token cookie
	c.SetCookie("session_token", token, int(s.auth.sessionTTL.Seconds()), "/", "", false, true)

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "",
		"data": gin.H{
			"must_change_password": mustChange,
			"set-cookie": gin.H{
				"session_token": token,
			},
		},
	})
}

// GET & POST /api/logout
func (s *Server) handleKomariLogout(c *gin.Context) {
	token := extractSessionToken(c)
	if token != "" {
		s.auth.Revoke(token)
	}
	clearSessionCookie(c)
	c.SetCookie("session_token", "", -1, "/", "", false, true)
	if strings.Contains(c.GetHeader("Accept"), "application/json") || c.ContentType() == "application/json" {
		c.JSON(http.StatusOK, gin.H{"status": "success", "message": "logged out"})
		return
	}
	c.Redirect(http.StatusFound, "/")
}

// GET /api/clients (WebSocket)
func (s *Server) handleKomariClientsWS(c *gin.Context) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[Komari WS] Upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	// Helper to send snapshot of current nodes
	sendSnapshot := func() error {
		nodes := s.hub.GetAllStates()
		online := make([]string, 0)
		dataMap := make(map[string]KomariLiveNodeData)

		for _, n := range nodes {
			if n.IsOnline {
				online = append(online, n.NodeID)
			}

			cpuName := n.System.CPUModel
			if cpuName == "" {
				cpuName = "Standard CPU"
			}
			cpuCores := n.System.CPUCount
			if cpuCores <= 0 {
				cpuCores = 1
			}

			dataMap[n.NodeID] = KomariLiveNodeData{
				CPU: KomariLiveCPU{
					Name:  cpuName,
					Cores: cpuCores,
					Arch:  "x86_64",
					Usage: n.CPU,
				},
				RAM: KomariLiveRAM{
					Total: n.System.MemTotal,
					Used:  n.System.MemUsed,
				},
				Swap: KomariLiveRAM{
					Total: n.System.SwapTotal,
					Used:  n.System.SwapUsed,
				},
				Load: KomariLiveLoad{
					Load1:  n.System.Load1,
					Load5:  n.System.Load5,
					Load15: n.System.Load15,
				},
				Disk: KomariLiveRAM{
					Total: n.System.DiskTotal,
					Used:  n.System.DiskUsed,
				},
				Network: KomariLiveNetwork{
					Up:        n.RateUp,
					Down:      n.RateDown,
					TotalUp:   n.Network.BytesSent,
					TotalDown: n.Network.BytesRecv,
				},
				Connections: KomariLiveConnections{
					TCP: n.Network.TCPEstablished,
					UDP: n.Network.UDPEstablished,
				},
				Uptime:    n.System.Uptime,
				Process:   n.System.ProcessCount,
				Message:   "",
				UpdatedAt: time.Unix(n.LastSeen, 0).UTC().Format(time.RFC3339),
			}
		}

		resp := KomariClientsWSResponse{
			Status: "success",
			Data: KomariClientsWSData{
				Online: online,
				Data:   dataMap,
			},
		}
		return conn.WriteJSON(resp)
	}

	// Channel for incoming client messages
	clientMsgCh := make(chan string, 4)
	go func() {
		defer close(clientMsgCh)
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			clientMsgCh <- strings.TrimSpace(string(msg))
		}
	}()

	// Periodic ticker to push real-time updates (every 1500ms)
	ticker := time.NewTicker(1500 * time.Millisecond)
	defer ticker.Stop()

	// Initial send
	_ = sendSnapshot()

	for {
		select {
		case msg, ok := <-clientMsgCh:
			if !ok {
				return
			}
			if strings.HasPrefix(msg, "get") {
				_ = sendSnapshot()
			}
		case <-ticker.C:
			if err := sendSnapshot(); err != nil {
				return
			}
		}
	}
}

// GET /api/records/load
func (s *Server) handleKomariRecordsLoad(c *gin.Context) {
	uuid := c.Query("uuid")
	loadType := c.DefaultQuery("load_type", "cpu")
	hoursStr := c.DefaultQuery("hours", "4")
	hours, _ := strconv.Atoi(hoursStr)
	if hours <= 0 {
		hours = 4
	}

	end := time.Now().Unix()
	start := end - int64(hours*3600)

	history, err := s.storage.GetHistory(uuid, start, end)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"status":  "success",
			"message": "",
			"data": gin.H{
				"records":   []interface{}{},
				"count":     0,
				"load_type": loadType,
			},
		})
		return
	}

	type KomariLoadRecord struct {
		Client         string  `json:"client"`
		Time           string  `json:"time"`
		CPU            float64 `json:"cpu"`
		GPU            float64 `json:"gpu"`
		RAM            uint64  `json:"ram"`
		RAMTotal       uint64  `json:"ram_total"`
		Swap           uint64  `json:"swap"`
		SwapTotal      uint64  `json:"swap_total"`
		Load           float64 `json:"load"`
		Temp           float64 `json:"temp"`
		Disk           uint64  `json:"disk"`
		DiskTotal      uint64  `json:"disk_total"`
		NetIn          float64 `json:"net_in"`
		NetOut         float64 `json:"net_out"`
		NetTotalUp     uint64  `json:"net_total_up"`
		NetTotalDown   uint64  `json:"net_total_down"`
		Process        int     `json:"process"`
		Connections    int     `json:"connections"`
		ConnectionsUDP int     `json:"connections_udp"`
	}

	records := make([]KomariLoadRecord, 0, len(history))
	for _, p := range history {
		records = append(records, KomariLoadRecord{
			Client:         uuid,
			Time:           time.Unix(p.Timestamp, 0).UTC().Format(time.RFC3339),
			CPU:            p.CPUPercent,
			RAM:            p.MemUsed,
			RAMTotal:       p.MemTotal,
			Swap:           p.SwapUsed,
			SwapTotal:      p.SwapTotal,
			Load:           p.Load1,
			Disk:           p.DiskUsed,
			DiskTotal:      p.DiskTotal,
			NetIn:          p.RateDownload,
			NetOut:         p.RateUpload,
			Process:        p.ProcessCount,
			Connections:    p.TCPCount,
			ConnectionsUDP: p.UDPCount,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "",
		"data": gin.H{
			"records":   records,
			"count":     len(records),
			"load_type": loadType,
		},
	})
}

// GET /api/records/ping
func (s *Server) handleKomariRecordsPing(c *gin.Context) {
	uuid := c.Query("uuid")
	hoursStr := c.DefaultQuery("hours", "4")
	hours, _ := strconv.Atoi(hoursStr)
	if hours <= 0 {
		hours = 4
	}

	end := time.Now().Unix()
	start := end - int64(hours*3600)

	history, err := s.storage.GetPingHistory(uuid, start, end)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"status":  "success",
			"message": "",
			"data": gin.H{
				"count":   0,
				"records": []interface{}{},
			},
		})
		return
	}

	type KomariPingRecord struct {
		TaskID int64   `json:"task_id"`
		Time   string  `json:"time"`
		Value  float64 `json:"value"`
		Loss   float64 `json:"loss"`
		Client string  `json:"client"`
	}

	records := make([]KomariPingRecord, 0, len(history))
	for _, p := range history {
		records = append(records, KomariPingRecord{
			TaskID: 1,
			Time:   time.Unix(p.Timestamp, 0).UTC().Format(time.RFC3339),
			Value:  p.LatencyMs,
			Loss:   p.PacketLoss,
			Client: uuid,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "",
		"data": gin.H{
			"count":   len(records),
			"records": records,
		},
	})
}

// GET /api/task/ping
func (s *Server) handleKomariTaskPing(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "",
		"data":    s.getKomariRPCPingTasks(),
	})
}

// --- Komari JSON-RPC 2.0 Handlers ---

// GET /api/rpc2 (WebSocket handshake or endpoint status)
func (s *Server) handleKomariRPC2GET(c *gin.Context) {
	if c.GetHeader("Upgrade") != "websocket" && !websocket.IsWebSocketUpgrade(c.Request) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "success",
			"message": "Probe Komari JSON-RPC 2.0 Endpoint",
		})
		return
	}

	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[Komari RPC2 WS] Upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	for {
		messageType, message, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if messageType != websocket.TextMessage {
			continue
		}

		trimmed := bytes.TrimSpace(message)
		if len(trimmed) == 0 {
			continue
		}

		if trimmed[0] == '[' {
			var requests []JSONRPCRequest
			if err := json.Unmarshal(trimmed, &requests); err == nil {
				responses := make([]JSONRPCResponse, 0, len(requests))
				for _, req := range requests {
					res, rpcErr := s.executeRPCMethod(req.Method, req.Params)
					resp := JSONRPCResponse{JSONRPC: "2.0", ID: req.ID}
					if rpcErr != nil {
						resp.Error = rpcErr
					} else {
						resp.Result = res
					}
					responses = append(responses, resp)
				}
				_ = conn.WriteJSON(responses)
			}
		} else {
			var req JSONRPCRequest
			if err := json.Unmarshal(trimmed, &req); err == nil {
				res, rpcErr := s.executeRPCMethod(req.Method, req.Params)
				resp := JSONRPCResponse{JSONRPC: "2.0", ID: req.ID}
				if rpcErr != nil {
					resp.Error = rpcErr
				} else {
					resp.Result = res
				}
				_ = conn.WriteJSON(resp)
			}
		}
	}
}

// POST /api/rpc2 (JSON-RPC 2.0 over HTTP)
func (s *Server) handleKomariRPC2POST(c *gin.Context) {
	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusOK, JSONRPCResponse{
			JSONRPC: "2.0",
			Error:   &JSONRPCError{Code: -32700, Message: "Parse error"},
		})
		return
	}

	trimmed := bytes.TrimSpace(bodyBytes)
	if len(trimmed) == 0 {
		c.JSON(http.StatusOK, JSONRPCResponse{
			JSONRPC: "2.0",
			Error:   &JSONRPCError{Code: -32600, Message: "Invalid Request"},
		})
		return
	}

	if trimmed[0] == '[' {
		var requests []JSONRPCRequest
		if err := json.Unmarshal(trimmed, &requests); err != nil {
			c.JSON(http.StatusOK, JSONRPCResponse{
				JSONRPC: "2.0",
				Error:   &JSONRPCError{Code: -32700, Message: "Parse error"},
			})
			return
		}

		responses := make([]JSONRPCResponse, 0, len(requests))
		for _, req := range requests {
			res, rpcErr := s.executeRPCMethod(req.Method, req.Params)
			resp := JSONRPCResponse{JSONRPC: "2.0", ID: req.ID}
			if rpcErr != nil {
				resp.Error = rpcErr
			} else {
				resp.Result = res
			}
			responses = append(responses, resp)
		}
		c.JSON(http.StatusOK, responses)
		return
	}

	var req JSONRPCRequest
	if err := json.Unmarshal(trimmed, &req); err != nil {
		c.JSON(http.StatusOK, JSONRPCResponse{
			JSONRPC: "2.0",
			Error:   &JSONRPCError{Code: -32700, Message: "Parse error"},
		})
		return
	}

	res, rpcErr := s.executeRPCMethod(req.Method, req.Params)
	resp := JSONRPCResponse{JSONRPC: "2.0", ID: req.ID}
	if rpcErr != nil {
		resp.Error = rpcErr
	} else {
		resp.Result = res
	}
	c.JSON(http.StatusOK, resp)
}

// executeRPCMethod executes a Komari JSON-RPC method and returns its result or error.
func (s *Server) executeRPCMethod(method string, params interface{}) (interface{}, *JSONRPCError) {
	switch method {
	case "rpc.ping":
		return "pong", nil
	case "rpc.methods":
		return []string{
			"rpc.ping",
			"rpc.methods",
			"rpc.getVersion",
			"common:getNodes",
			"common:getNodesLatestStatus",
			"common:getNodeRecentStatus",
			"common:getPublicInfo",
			"common:getBackendVersion",
			"common:getRecords",
			"common:getVersion",
		}, nil
	case "rpc.getVersion":
		return "1.0.5", nil
	case "common:getVersion", "common:getBackendVersion":
		return gin.H{
			"version": "1.0.5",
			"hash":    "probe-hub",
		}, nil
	case "common:getPublicInfo":
		activeTheme := "builtin"
		themeSettings := map[string]interface{}{}
		if s.themeManager != nil {
			activeTheme = s.themeManager.GetActiveTheme()
			themeSettings = s.themeManager.GetThemeSettings(activeTheme)
		}
		return KomariPublicData{
			Sitename:      "Cyber Probe",
			Theme:         activeTheme,
			ThemeSettings: themeSettings,
			PrivateSite:   s.privateMode,
		}, nil
	case "common:getNodes":
		return s.getKomariRPCNodes(), nil
	case "common:getNodesLatestStatus":
		return s.getKomariRPCNodesLatestStatus(), nil
	case "common:getNodeRecentStatus":
		return s.getKomariNodeRecentStatus(params), nil
	case "common:getRecords":
		return s.getKomariRecords(params), nil
	case "public:listMetricDefinitions", "admin:listMetricDefinitions":
		return []interface{}{}, nil
	case "public:getPublicPingTasks", "admin:getAllPingTasks":
		return s.getKomariRPCPingTasks(), nil
	case "public:getPingMetricStats":
		return s.getKomariPingMetricStats(params), nil
	case "public:queryMetrics":
		return s.getKomariQueryMetrics(params), nil
	case "admin:listPlugins":
		return []interface{}{}, nil
	default:
		return gin.H{}, nil
	}
}

// getKomariRPCNodes maps Probe node inventory to Komari common:getNodes representation (map keyed by UUID).
func (s *Server) getKomariRPCNodes() map[string]KomariRpcNode {
	nodes := s.hub.GetAllStates()
	nodeMap := make(map[string]KomariRpcNode, len(nodes))
	for _, n := range nodes {
		cpuName := n.System.CPUModel
		if cpuName == "" {
			cpuName = "Standard CPU"
		}
		cpuCores := n.System.CPUCount
		if cpuCores <= 0 {
			cpuCores = 1
		}
		createdStr := time.Unix(n.LastSeen, 0).UTC().Format(time.RFC3339)
		if n.System.Uptime > 0 {
			createdStr = time.Unix(time.Now().Unix()-int64(n.System.Uptime), 0).UTC().Format(time.RFC3339)
		}
		updatedStr := time.Unix(n.LastSeen, 0).UTC().Format(time.RFC3339)

		currency := n.Billing.Currency
		if currency == "" {
			currency = "USD"
		}
		group := "Default"
		if len(n.Tags) > 0 {
			group = n.Tags[0]
		}
		tagsStr := strings.Join(n.Tags, ", ")
		if tagsStr == "" {
			tagsStr = n.Billing.Provider
		}

		virt := n.System.Virtualization
		if virt == "" {
			virt = "kvm"
		}

		nodeMap[n.NodeID] = KomariRpcNode{
			UUID:             n.NodeID,
			Name:             n.Name,
			CPUName:          cpuName,
			Virtualization:   virt,
			Arch:             "x86_64",
			CPUCores:         cpuCores,
			OS:               n.System.OS,
			KernelVersion:    n.System.Kernel,
			GPUName:          "",
			Region:           n.Region,
			MemTotal:         n.System.MemTotal,
			SwapTotal:        n.System.SwapTotal,
			DiskTotal:        n.System.DiskTotal,
			Version:          n.System.AgentVersion,
			Weight:           0,
			Price:            n.Billing.Price,
			Tags:             tagsStr,
			BillingCycle:     0,
			Currency:         currency,
			Group:            group,
			TrafficLimit:     n.Billing.BandwidthQuota,
			TrafficLimitType: "sum",
			ExpiredAt:        n.Billing.ExpiryDate,
			CreatedAt:        createdStr,
			UpdatedAt:        updatedStr,
			IPv4:             n.System.PublicIP,
			IPv6:             n.System.PublicIPv6,
			PublicRemark:     n.Billing.Provider,
		}
	}
	return nodeMap
}

// getKomariNodeRecentStatus fetches recent telemetry points for a node.
func (s *Server) getKomariNodeRecentStatus(params interface{}) interface{} {
	uuid := ""
	limit := 150
	if m, ok := params.(map[string]interface{}); ok {
		if u, ok := m["uuid"].(string); ok {
			uuid = u
		}
		if l, ok := m["limit"].(float64); ok && l > 0 {
			limit = int(l)
		}
	}

	end := time.Now().Unix()
	start := end - int64(4*3600)

	history, err := s.storage.GetHistory(uuid, start, end)
	if err != nil || len(history) == 0 {
		return gin.H{"records": []interface{}{}}
	}

	if len(history) > limit {
		history = history[len(history)-limit:]
	}

	type KomariLoadRecord struct {
		Client         string  `json:"client"`
		Time           string  `json:"time"`
		CPU            float64 `json:"cpu"`
		GPU            float64 `json:"gpu"`
		RAM            uint64  `json:"ram"`
		RAMTotal       uint64  `json:"ram_total"`
		Swap           uint64  `json:"swap"`
		SwapTotal      uint64  `json:"swap_total"`
		Load           float64 `json:"load"`
		Temp           float64 `json:"temp"`
		Disk           uint64  `json:"disk"`
		DiskTotal      uint64  `json:"disk_total"`
		NetIn          float64 `json:"net_in"`
		NetOut         float64 `json:"net_out"`
		NetTotalUp     uint64  `json:"net_total_up"`
		NetTotalDown   uint64  `json:"net_total_down"`
		Process        int     `json:"process"`
		Connections    int     `json:"connections"`
		ConnectionsUDP int     `json:"connections_udp"`
	}

	records := make([]KomariLoadRecord, 0, len(history))
	for _, p := range history {
		records = append(records, KomariLoadRecord{
			Client:         uuid,
			Time:           time.Unix(p.Timestamp, 0).UTC().Format(time.RFC3339),
			CPU:            p.CPUPercent,
			RAM:            p.MemUsed,
			RAMTotal:       p.MemTotal,
			Swap:           p.SwapUsed,
			SwapTotal:      p.SwapTotal,
			Load:           p.Load1,
			Disk:           p.DiskUsed,
			DiskTotal:      p.DiskTotal,
			NetIn:          p.RateDownload,
			NetOut:         p.RateUpload,
			Process:        p.ProcessCount,
			Connections:    p.TCPCount,
			ConnectionsUDP: p.UDPCount,
		})
	}

	return gin.H{"records": records}
}

// getKomariRecords handles common:getRecords for load or ping queries.
func (s *Server) getKomariRecords(params interface{}) interface{} {
	recType := "load"
	uuid := ""
	if m, ok := params.(map[string]interface{}); ok {
		if t, ok := m["type"].(string); ok {
			recType = t
		}
		if u, ok := m["uuid"].(string); ok {
			uuid = u
		}
	}

	if recType == "ping" {
		return gin.H{
			"records": []interface{}{},
			"tasks":   s.getKomariRPCPingTasks(),
		}
	}

	if uuid != "" {
		return s.getKomariNodeRecentStatus(params)
	}

	nodes := s.hub.GetAllStates()
	grouped := make(map[string][]interface{})
	for _, n := range nodes {
		grouped[n.NodeID] = []interface{}{}
	}
	return gin.H{
		"records": grouped,
	}
}

// getKomariRPCNodesLatestStatus maps Probe real-time telemetry to Komari common:getNodesLatestStatus.
func (s *Server) getKomariRPCNodesLatestStatus() map[string]KomariRpcNodeStatus {
	nodes := s.hub.GetAllStates()
	statusMap := make(map[string]KomariRpcNodeStatus, len(nodes))
	for _, n := range nodes {
		st := KomariRpcNodeStatus{
			Client:       n.NodeID,
			Online:       n.IsOnline,
			RAM:          n.System.MemUsed,
			Swap:         n.System.SwapUsed,
			Disk:         n.System.DiskUsed,
			NetTotalUp:   n.Network.BytesSent,
			NetTotalDown: n.Network.BytesRecv,
			Time:         n.LastSeen,
		}
		if n.IsOnline {
			st.CPU = n.CPU
			st.Load = n.System.Load1
			st.Load5 = n.System.Load5
			st.Load15 = n.System.Load15
			st.NetIn = n.RateDown
			st.NetOut = n.RateUp
			st.Connections = n.Network.TCPEstablished
			st.ConnectionsUDP = n.Network.UDPEstablished
			st.Uptime = n.System.Uptime
			st.Process = n.System.ProcessCount
		}
		statusMap[n.NodeID] = st
	}
	return statusMap
}

// getKomariRPCPingTasks returns active ping tasks in Komari format.
func (s *Server) getKomariRPCPingTasks() []KomariPingTask {
	targets, _ := s.storage.GetPingTargets()
	list := make([]KomariPingTask, 0, len(targets))
	for _, t := range targets {
		if !t.Enabled {
			continue
		}
		list = append(list, KomariPingTask{
			ID:        t.ID,
			Weight:    0,
			Name:      t.Label,
			Clients:   t.Servers,
			DefaultOn: t.AutoStart,
			Type:      t.Protocol,
			Interval:  t.Interval,
		})
	}
	return list
}

// GET /api/admin/client/list
func (s *Server) handleKomariAdminClientList(c *gin.Context) {
	nodeMap := s.getKomariRPCNodes()
	list := make([]KomariRpcNode, 0, len(nodeMap))
	for _, n := range nodeMap {
		list = append(list, n)
	}
	c.JSON(http.StatusOK, list)
}

// GET /api/admin/database/size
func (s *Server) handleKomariAdminDBSize(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "",
		"data": gin.H{
			"main":       gin.H{"size": 1024 * 1024},
			"monitoring": gin.H{"size": 1024 * 1024},
		},
	})
}

// --- Theme Management REST Handlers ---

// GET /api/v1/themes
func (s *Server) handleListThemes(tm *ThemeManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		installed := tm.GetInstalledThemes()
		active := tm.GetActiveTheme()

		c.JSON(http.StatusOK, gin.H{
			"active":    active,
			"installed": installed,
		})
	}
}

// POST /api/v1/themes/active
func (s *Server) handleSetActiveTheme(tm *ThemeManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Theme string `json:"theme"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Theme == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "theme identifier is required"})
			return
		}

		if err := tm.SetActiveTheme(body.Theme); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"active":  body.Theme,
			"message": "Theme activated successfully",
		})
	}
}

// GET /api/v1/themes/market
func (s *Server) handleGetThemeMarket(tm *ThemeManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		themes, err := tm.FetchMarketThemes()
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"themes": themes,
		})
	}
}

// POST /api/v1/themes/install
func (s *Server) handleInstallTheme(tm *ThemeManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			URL    string `json:"url"`
			SHA256 string `json:"sha256"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.URL == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "valid download url is required"})
			return
		}

		item, err := tm.DownloadAndInstall(body.URL, body.SHA256)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Theme installed successfully",
			"theme":   item,
		})
	}
}

// POST /api/v1/themes/upload
func (s *Server) handleUploadTheme(tm *ThemeManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		fileHeader, err := c.FormFile("theme")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file 'theme' is required"})
			return
		}

		file, err := fileHeader.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to open uploaded file"})
			return
		}
		defer file.Close()

		ra, ok := file.(io.ReaderAt)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "uploaded file is not seekable"})
			return
		}

		item, err := tm.InstallFromZip(ra, fileHeader.Size)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Theme uploaded and installed successfully",
			"theme":   item,
		})
	}
}

// DELETE /api/v1/themes/:short
func (s *Server) handleDeleteTheme(tm *ThemeManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		short := c.Param("short")
		if err := tm.DeleteTheme(short); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Theme deleted successfully"})
	}
}

// --- Komari metrics compatibility (public:queryMetrics / getPingMetricStats) ---
//
// Modern Komari themes chart telemetry through these two JSON-RPC methods.
// Series follow the upstream shape: one entry per (entity, metric) with the
// ping metrics additionally tagged by task_id, points as {time, value} in
// RFC3339. Returning empty payloads here left every 延迟/丢包 chart blank and
// the loss summary rendering NaN%, which is why they are backed by the same
// downsampler history the built-in dashboard charts read.

// komariMetricPoint is one sampled value on a metric series. Time is RFC3339
// because dayjs in the themes parses it directly.
type KomariMetricPoint struct {
	Time  string  `json:"time"`
	Value float64 `json:"value"`
}

// KomariMetricSeries is one metric stream. Tags carry the ping task id on
// both the series and each point: emerald-globe-pro reads the series-level
// tag while ServerStatus groups per-point, so both are populated.
type KomariMetricSeries struct {
	MetricKey string                 `json:"metric_key"`
	EntityID  string                 `json:"entity_id"`
	Unit      string                 `json:"unit,omitempty"`
	Tags      map[string]interface{} `json:"tags,omitempty"`
	Points    []KomariMetricPoint    `json:"points"`
}

// komariQueryMetricsParams covers the union of arguments the themes send.
type komariQueryMetricsParams struct {
	MetricKeys []string `json:"metric_keys"`
	Metrics    []string `json:"metrics"` // alias some themes use
	EntityID   string   `json:"entity_id"`
	UUID       string   `json:"uuid"`
	Hours      int      `json:"hours"`
	MaxPoints  int      `json:"max_points"`
}

// komariXY is a raw timestamped value before bucketing.
type komariXY struct {
	t int64
	v float64
}

// komariBucketPoints averages raw samples into at most maxPoints uniform
// buckets across [start, end], mirroring the "aggregation":"avg" the themes
// request. The point time is its bucket start so charts align on the axis.
func komariBucketPoints(start, end int64, maxPoints int, raw []komariXY) []KomariMetricPoint {
	if len(raw) == 0 {
		return []KomariMetricPoint{}
	}
	if maxPoints <= 0 {
		maxPoints = 500
	}
	span := end - start
	if span <= 0 {
		span = 1
	}
	buckets := int(span) // one second per bucket at most
	if buckets > maxPoints {
		buckets = maxPoints
	}
	if buckets < 1 {
		buckets = 1
	}
	width := float64(span) / float64(buckets)

	sums := make([]float64, buckets)
	counts := make([]int, buckets)
	for _, p := range raw {
		idx := int(float64(p.t-start) / width)
		if idx < 0 {
			idx = 0
		}
		if idx >= buckets {
			idx = buckets - 1
		}
		sums[idx] += p.v
		counts[idx]++
	}

	points := make([]KomariMetricPoint, 0, buckets)
	for i := 0; i < buckets; i++ {
		if counts[i] == 0 {
			continue
		}
		points = append(points, KomariMetricPoint{
			Time:  time.Unix(start+int64(float64(i)*width), 0).UTC().Format(time.RFC3339),
			Value: sums[i] / float64(counts[i]),
		})
	}
	return points
}

// komariTaskIDLookup builds label/target → task id maps so ping_points rows
// (which carry the target label, not the task id) can be attributed to the
// ping task the themes expect in tags.task_id.
type komariTaskIDLookup struct {
	byLabel  map[string]model.PingTargetConfig
	byTarget map[string]model.PingTargetConfig
}

func (s *Server) komariPingTaskLookup() komariTaskIDLookup {
	lookup := komariTaskIDLookup{byLabel: map[string]model.PingTargetConfig{}, byTarget: map[string]model.PingTargetConfig{}}
	targets, err := s.storage.GetPingTargets()
	if err != nil {
		return lookup
	}
	for _, t := range targets {
		if t.Label != "" {
			lookup.byLabel[strings.ToLower(t.Label)] = t
		}
		if t.Target != "" {
			lookup.byTarget[strings.ToLower(t.Target)] = t
		}
	}
	return lookup
}

func (l komariTaskIDLookup) resolve(point *model.PingHistoryPoint) (model.PingTargetConfig, bool) {
	if t, ok := l.byLabel[strings.ToLower(point.Label)]; ok {
		return t, true
	}
	if t, ok := l.byTarget[strings.ToLower(point.Target)]; ok {
		return t, true
	}
	return model.PingTargetConfig{}, false
}

// getKomariQueryMetrics serves public:queryMetrics. Only keys this server can
// truthfully produce are answered; unknown keys simply get no series, which
// the themes render as an empty chart rather than an error.
func (s *Server) getKomariQueryMetrics(params interface{}) interface{} {
	p := komariQueryMetricsParams{Hours: 1, MaxPoints: 500}
	if raw, err := json.Marshal(params); err == nil {
		_ = json.Unmarshal(raw, &p)
	}
	p.MetricKeys = append(p.MetricKeys, p.Metrics...)
	if p.Hours <= 0 {
		p.Hours = 1
	}
	if p.Hours > 720 {
		p.Hours = 720
	}
	if p.MaxPoints <= 0 {
		p.MaxPoints = 500
	}
	if p.MaxPoints > 3000 {
		p.MaxPoints = 3000
	}

	entity := p.EntityID
	if entity == "" {
		entity = p.UUID
	}
	empty := gin.H{"series": []interface{}{}}
	if entity == "" || len(p.MetricKeys) == 0 {
		return empty
	}

	end := time.Now().Unix()
	start := end - int64(p.Hours*3600)

	want := func(key string) bool {
		for _, k := range p.MetricKeys {
			if strings.TrimSpace(k) == key {
				return true
			}
		}
		return false
	}

	series := make([]KomariMetricSeries, 0, len(p.MetricKeys))

	// Ping metrics: a latency and a loss stream per ping task.
	if want("ping.latency_ms") || want("ping.loss") {
		lookup := s.komariPingTaskLookup()
		history, err := s.storage.GetPingHistory(entity, start, end)
		if err == nil {
			grouped := map[int64]*struct {
				task model.PingTargetConfig
				lat  []komariXY
				loss []komariXY
			}{}
			order := []int64{}
			for _, pt := range history {
				task, ok := lookup.resolve(pt)
				if !ok {
					continue
				}
				g := grouped[task.ID]
				if g == nil {
					g = &struct {
						task model.PingTargetConfig
						lat  []komariXY
						loss []komariXY
					}{task: task}
					grouped[task.ID] = g
					order = append(order, task.ID)
				}
				g.lat = append(g.lat, komariXY{t: pt.Timestamp, v: pt.LatencyMs})
				g.loss = append(g.loss, komariXY{t: pt.Timestamp, v: pt.PacketLoss})
			}
			for _, id := range order {
				g := grouped[id]
				if want("ping.latency_ms") {
					series = append(series, KomariMetricSeries{
						MetricKey: "ping.latency_ms",
						EntityID:  entity,
						Unit:      "ms",
						Tags:      map[string]interface{}{"task_id": g.task.ID},
						Points:    komariBucketPoints(start, end, p.MaxPoints, g.lat),
					})
				}
				if want("ping.loss") {
					series = append(series, KomariMetricSeries{
						MetricKey: "ping.loss",
						EntityID:  entity,
						Unit:      "%",
						Tags:      map[string]interface{}{"task_id": g.task.ID},
						Points:    komariBucketPoints(start, end, p.MaxPoints, g.loss),
					})
				}
			}
		}
	}

	// Load metrics from the downsampler history. Cumulative traffic
	// (net.total.up/down) is intentionally absent: the downsampled history
	// carries rates only, and inventing totals would mislead the charts.
	loadKeys := map[string]bool{}
	for _, key := range []string{"cpu.usage", "memory.used", "memory.total", "swap.used", "swap.total", "disk.used", "disk.total", "net.in.rate", "net.out.rate", "load.load1"} {
		if want(key) {
			loadKeys[key] = true
		}
	}
	if len(loadKeys) > 0 {
		history, err := s.storage.GetHistory(entity, start, end)
		if err == nil {
			extract := map[string]func(*model.HistoryPoint) (float64, string){
				"cpu.usage":    func(h *model.HistoryPoint) (float64, string) { return h.CPUPercent, "%" },
				"memory.used":  func(h *model.HistoryPoint) (float64, string) { return float64(h.MemUsed), "bytes" },
				"memory.total": func(h *model.HistoryPoint) (float64, string) { return float64(h.MemTotal), "bytes" },
				"swap.used":    func(h *model.HistoryPoint) (float64, string) { return float64(h.SwapUsed), "bytes" },
				"swap.total":   func(h *model.HistoryPoint) (float64, string) { return float64(h.SwapTotal), "bytes" },
				"disk.used":    func(h *model.HistoryPoint) (float64, string) { return float64(h.DiskUsed), "bytes" },
				"disk.total":   func(h *model.HistoryPoint) (float64, string) { return float64(h.DiskTotal), "bytes" },
				"net.in.rate":  func(h *model.HistoryPoint) (float64, string) { return h.RateDownload, "bytes/s" },
				"net.out.rate": func(h *model.HistoryPoint) (float64, string) { return h.RateUpload, "bytes/s" },
				"load.load1":   func(h *model.HistoryPoint) (float64, string) { return h.Load1, "" },
			}
			for key, fn := range extract {
				if !loadKeys[key] {
					continue
				}
				raw := make([]komariXY, 0, len(history))
				for _, h := range history {
					v, _ := fn(h)
					raw = append(raw, komariXY{t: h.Timestamp, v: v})
				}
				unit := ""
				if len(raw) > 0 {
					_, unit = fn(history[0])
				}
				series = append(series, KomariMetricSeries{
					MetricKey: key,
					EntityID:  entity,
					Unit:      unit,
					Points:    komariBucketPoints(start, end, p.MaxPoints, raw),
				})
			}
		}
	}

	return gin.H{"series": series}
}

// KomariPingMetricStat is one task's aggregate over the queried window. The
// themes read loss as a percentage and derive the volatility badge from
// p99_p50_ratio, so both are computed exactly rather than left zero.
type KomariPingMetricStat struct {
	EntityID        string  `json:"entity_id"`
	TaskID          int64   `json:"task_id"`
	Name            string  `json:"name"`
	Type            string  `json:"type,omitempty"`
	Interval        int     `json:"interval,omitempty"`
	Total           int     `json:"total"`
	Loss            float64 `json:"loss"`
	LossApproximate bool    `json:"loss_approximate"`
	Min             float64 `json:"min"`
	Max             float64 `json:"max"`
	Avg             float64 `json:"avg"`
	Latest          float64 `json:"latest"`
	P99             float64 `json:"p99"`
	P50             float64 `json:"p50"`
	P99P50Ratio     float64 `json:"p99_p50_ratio"`
}

// getKomariPingMetricStats serves public:getPingMetricStats: per-task loss
// and latency aggregates for the queried window.
func (s *Server) getKomariPingMetricStats(params interface{}) interface{} {
	p := komariQueryMetricsParams{Hours: 1, MaxPoints: 500}
	if raw, err := json.Marshal(params); err == nil {
		_ = json.Unmarshal(raw, &p)
	}
	if p.Hours <= 0 {
		p.Hours = 1
	}
	entity := p.EntityID
	if entity == "" {
		entity = p.UUID
	}
	empty := gin.H{"stats": []interface{}{}}
	if entity == "" {
		return empty
	}

	end := time.Now().Unix()
	start := end - int64(p.Hours*3600)

	lookup := s.komariPingTaskLookup()
	history, err := s.storage.GetPingHistory(entity, start, end)
	if err != nil {
		return empty
	}

	grouped := map[int64]*struct {
		task   model.PingTargetConfig
		lat    []float64
		loss   []float64
		latest float64
	}{}
	order := []int64{}
	for _, pt := range history {
		task, ok := lookup.resolve(pt)
		if !ok {
			continue
		}
		g := grouped[task.ID]
		if g == nil {
			g = &struct {
				task   model.PingTargetConfig
				lat    []float64
				loss   []float64
				latest float64
			}{task: task}
			grouped[task.ID] = g
			order = append(order, task.ID)
		}
		g.lat = append(g.lat, pt.LatencyMs)
		g.loss = append(g.loss, pt.PacketLoss)
		g.latest = pt.LatencyMs
	}

	stats := make([]KomariPingMetricStat, 0, len(order))
	for _, id := range order {
		g := grouped[id]
		if len(g.lat) == 0 {
			continue
		}
		sortedLat := append([]float64(nil), g.lat...)
		sort.Float64s(sortedLat)
		// Nearest-rank percentile: ceil(q*n)-1, clamped into the slice.
		pct := func(q float64) float64 {
			idx := int(math.Ceil(q * float64(len(sortedLat))))
			if idx < 1 {
				idx = 1
			}
			if idx > len(sortedLat) {
				idx = len(sortedLat)
			}
			return sortedLat[idx-1]
		}
		p50 := pct(0.50)
		p99 := pct(0.99)
		var sumLat, sumLoss float64
		for i := range g.lat {
			sumLat += g.lat[i]
			sumLoss += g.loss[i]
		}
		stat := KomariPingMetricStat{
			EntityID: entity,
			TaskID:   g.task.ID,
			Name:     g.task.Label,
			Type:     g.task.Protocol,
			Interval: g.task.Interval,
			Total:    len(g.lat),
			Loss:     sumLoss / float64(len(g.loss)),
			Min:      sortedLat[0],
			Max:      sortedLat[len(sortedLat)-1],
			Avg:      sumLat / float64(len(g.lat)),
			Latest:   g.latest,
			P99:      p99,
			P50:      p50,
		}
		if p50 > 0 {
			stat.P99P50Ratio = p99 / p50
		}
		stats = append(stats, stat)
	}
	return gin.H{"stats": stats}
}

// handleKomariRecent serves GET /api/recent/{uuid}: the node's recent status
// history in the same record shape the live WebSocket uses, because the
// instance-page monitor charts in Komari themes fetch this endpoint instead
// of subscribing to the stream. The last 150 points are returned, matching
// the window the themes slice to.
func (s *Server) handleKomariRecent(c *gin.Context) {
	uuid := c.Param("uuid")
	end := time.Now().Unix()
	start := end - 3600

	history, err := s.storage.GetHistory(uuid, start, end)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": "success", "message": "", "data": []interface{}{}})
		return
	}
	if len(history) > 150 {
		history = history[len(history)-150:]
	}

	records := make([]gin.H, 0, len(history))
	for _, p := range history {
		records = append(records, gin.H{
			"updated_at": time.Unix(p.Timestamp, 0).UTC().Format(time.RFC3339),
			"cpu":        gin.H{"usage": p.CPUPercent},
			"ram":        gin.H{"used": p.MemUsed, "total": p.MemTotal},
			"swap":       gin.H{"used": p.SwapUsed, "total": p.SwapTotal},
			"load":       gin.H{"load1": p.Load1},
			"disk":       gin.H{"used": p.DiskUsed, "total": p.DiskTotal},
			"network": gin.H{
				"up":        p.RateUpload,
				"down":      p.RateDownload,
				"totalUp":   0,
				"totalDown": 0,
			},
			"connections": gin.H{"tcp": p.TCPCount, "udp": p.UDPCount},
			"process":     p.ProcessCount,
			"uptime":      0,
			"message":     "",
		})
	}

	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "", "data": records})
}
