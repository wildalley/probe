package server

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

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
		return gin.H{
			"stats": []interface{}{},
		}, nil
	case "public:queryMetrics":
		return gin.H{
			"series": []interface{}{},
		}, nil
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
