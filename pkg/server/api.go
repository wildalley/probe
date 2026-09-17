package server

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"probe/pkg/model"
	"probe/pkg/netguard"
	"probe/pkg/version"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// agentUpgrader serves probe agents. They authenticate with a probe token and
// are not browsers, so no Origin header is expected.
var agentUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
}

// clientUpgrader serves browser dashboards. Those carry a session cookie, so the
// Origin must be checked to stop a hostile page from opening the stream.
func (s *Server) clientUpgrader(c *gin.Context) websocket.Upgrader {
	return websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				return true // non-browser client, e.g. a CLI consumer
			}
			return s.isTrustedOrigin(c, origin)
		},
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
	}
}

// Server encapsulates the HTTP/WebSocket router and business dependencies.
type Server struct {
	router      *gin.Engine
	hub         *Hub
	storage     *Storage
	downsampler *Downsampler
	notifier    *Notifier
	distFS      fs.FS
	auth        *AuthManager

	// privateMode requires a login even for read-only telemetry views.
	privateMode bool

	// allowedOrigins lists extra browser origins permitted to send credentialed
	// requests, for setups where the dashboard is served from another host.
	allowedOrigins []string
}

// NewServer initializes Gin and binds endpoints.
func NewServer(hub *Hub, storage *Storage, downsampler *Downsampler, notifier *Notifier, distFS fs.FS, auth *AuthManager, privateMode bool) *Server {
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())

	// Logger middleware with clean output
	router.Use(func(c *gin.Context) {
		start := time.Now()
		c.Next()
		if !strings.HasPrefix(c.Request.URL.Path, "/api/v1/agent/ws") && !strings.HasPrefix(c.Request.URL.Path, "/api/v1/client/ws") {
			status := c.Writer.Status()
			if status >= 400 {
				log.Printf("[HTTP] %s %s - %d in %v", c.Request.Method, c.Request.URL.Path, status, time.Since(start))
			}
		}
	})

	s := &Server{
		router:      router,
		hub:         hub,
		storage:     storage,
		downsampler: downsampler,
		notifier:    notifier,
		distFS:      distFS,
		auth:        auth,
		privateMode: privateMode,
	}

	// PROBE_ALLOWED_ORIGINS is a comma-separated list, e.g.
	// "https://probe.example.com,http://localhost:5173" for Vite dev mode.
	for _, o := range strings.Split(os.Getenv("PROBE_ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			s.allowedOrigins = append(s.allowedOrigins, strings.ToLower(strings.TrimSuffix(o, "/")))
		}
	}

	// Gin trusts every proxy by default, which makes c.ClientIP() read a
	// caller-supplied X-Forwarded-For. Login throttling counts failures per IP,
	// so that default lets an attacker sidestep the lockout by varying the
	// header. Trust nobody unless the operator names the proxies in front of us.
	var trustedProxies []string
	for _, p := range strings.Split(os.Getenv("PROBE_TRUSTED_PROXIES"), ",") {
		if p = strings.TrimSpace(p); p != "" {
			trustedProxies = append(trustedProxies, p)
		}
	}
	if err := router.SetTrustedProxies(trustedProxies); err != nil {
		log.Printf("[Server] Invalid PROBE_TRUSTED_PROXIES, falling back to trusting none: %v", err)
		_ = router.SetTrustedProxies(nil)
	}

	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	// CORS. Credentialed session cookies cannot be combined with a wildcard
	// origin, so echo back only origins we explicitly trust.
	s.router.Use(func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && s.isTrustedOrigin(c, origin) {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			c.Writer.Header().Set("Vary", "Origin")
		}
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization, X-Probe-Session, X-Node-ID, X-Node-Name, X-Node-Region")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	// Agent WebSocket authenticates with its own probe token, not a session.
	s.router.GET("/api/v1/agent/ws", s.handleAgentWS)
	s.router.GET("/ws/agent", s.handleAgentWS)

	// Dashboard live stream. Guarded in private mode.
	s.router.GET("/api/v1/client/ws", s.handleClientWS)
	s.router.GET("/ws/client", s.handleClientWS)

	// Auth endpoints. Login must stay reachable without a session.
	auth := s.router.Group("/api/v1/auth")
	{
		auth.POST("/login", s.handleLogin)
		auth.POST("/logout", s.handleLogout)
		auth.GET("/status", s.handleAuthStatus)
		auth.POST("/change-password", s.requireAuth(), s.handleChangePassword)
	}

	// Installer and agent binary stay public: they are fetched by curl/wget from
	// the target machine, which has no dashboard session. Neither contains a
	// secret — the agent token is passed as a command-line argument by the
	// operator, and the endpoints that hand out tokens require a session.
	s.router.GET("/install.sh", s.handleInstallScript)
	s.router.HEAD("/install.sh", s.handleInstallScript)
	s.router.GET("/download/probe-agent", s.handleDownloadAgent)
	s.router.HEAD("/download/probe-agent", s.handleDownloadAgent)
	s.router.GET("/api/v1/download/probe-agent", s.handleDownloadAgent)

	// Read-only telemetry. Public by default, session-gated in private mode.
	pub := s.router.Group("/api/v1", s.requireViewer())
	{
		pub.GET("/nodes", s.handleGetNodes)
		pub.GET("/nodes/:id", s.handleGetNode)
		pub.GET("/nodes/:id/history", s.handleGetNodeHistory)
		pub.GET("/nodes/:id/ping-history", s.handleGetNodePingHistory)
		pub.GET("/system/summary", s.handleSystemSummary)
		pub.GET("/ping-targets", s.handleGetPingTargets)
		pub.GET("/settings/rates", s.handleGetExchangeRates)
	}

	// Everything that mutates state or exposes agent tokens requires a session.
	admin := s.router.Group("/api/v1", s.requireAuth())
	{
		admin.DELETE("/nodes/:id", s.handleDeleteNode)

		// Agent tokens are credentials: never expose them to anonymous callers.
		admin.GET("/tokens", s.handleListTokens)
		admin.GET("/tokens/active", s.handleGetActiveToken)
		admin.POST("/tokens", s.handleCreateToken)

		// Ping targets management & instant test
		admin.POST("/ping-targets", s.handleAddPingTarget)
		admin.PUT("/ping-targets/:id", s.handleUpdatePingTarget)
		admin.DELETE("/ping-targets/:id", s.handleDeletePingTarget)
		admin.POST("/ping-targets/test", s.handleTestPingTarget)

		// Node settings & billing overrides
		admin.GET("/nodes/:id/settings", s.handleGetNodeSettings)
		admin.POST("/nodes/:id/settings", s.handleSaveNodeSettings)
		admin.GET("/node-settings", s.handleGetAllNodeSettings)

		// Exchange rates
		admin.POST("/settings/rates", s.handleSaveExchangeRates)
		admin.POST("/settings/rates/refresh", s.handleRefreshExchangeRates)

		// Notifications & Custom Alerts
		admin.GET("/notifications/settings", s.handleGetNotificationSettings)
		admin.POST("/notifications/settings", s.handleSaveNotificationSettings)
		admin.POST("/notifications/test", s.handleTestNotification)
		admin.GET("/notifications/logs", s.handleGetNotificationLogs)
		admin.DELETE("/notifications/logs", s.handleClearNotificationLogs)

		// GeoIP, ASN & Line Auto-Discovery
		admin.GET("/geoip/lookup", s.handleGeoIPLookup)
	}

	// Static Assets / Embedded SPA
	if s.distFS != nil {
		fileServer := http.FileServer(http.FS(s.distFS))
		s.router.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path
			// If API route or websocket, return 404
			if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/ws") {
				c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
				return
			}

			// Try to open the file
			trimmedPath := strings.TrimPrefix(path, "/")
			if trimmedPath == "" {
				trimmedPath = "index.html"
			}
			f, err := s.distFS.Open(trimmedPath)
			if err == nil {
				_ = f.Close()
				fileServer.ServeHTTP(c.Writer, c.Request)
				return
			}

			// Fallback to index.html for SPA routing
			c.Request.URL.Path = "/"
			fileServer.ServeHTTP(c.Writer, c.Request)
		})
	} else {
		s.router.GET("/", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"service": "probe-server",
				"version": version.Version,
				"status":  "running",
				"note":    "Web frontend is running separately or not embedded.",
			})
		})
	}
}

// handleAgentWS handles long connections from probe agents.
func (s *Server) handleAgentWS(c *gin.Context) {
	// 1. Authenticate Token
	token := s.extractToken(c)
	if !s.storage.ValidateToken(token) {
		log.Printf("[AgentWS] Handshake failed: unauthorized token from %s", c.ClientIP())
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized token"})
		return
	}

	// 2. Upgrade to WebSocket
	conn, err := agentUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[AgentWS] Upgrade failed: %v", err)
		return
	}
	// All writes to this socket go through the queue; the reader below stays on
	// this goroutine. Closing the queue closes the underlying connection.
	agentQueue := newWSWriteQueue(conn)
	defer agentQueue.Close()

	// Initial node metadata from headers if present
	headerNodeID := c.GetHeader("X-Node-ID")
	headerName := c.GetHeader("X-Node-Name")
	headerRegion := c.GetHeader("X-Node-Region")

	log.Printf("[AgentWS] Agent connected: %s (IP: %s)", headerNodeID, c.ClientIP())

	registeredIDs := make(map[string]struct{})
	defer func() {
		for nodeID := range registeredIDs {
			s.hub.UnregisterAgent(nodeID, agentQueue)
		}
	}()
	if headerNodeID != "" {
		s.hub.RegisterAgent(headerNodeID, agentQueue)
		registeredIDs[headerNodeID] = struct{}{}
	}

	conn.SetReadLimit(65536)
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		msgType, msg, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[AgentWS] Unexpected close from %s: %v", headerNodeID, err)
			}
			break
		}

		if msgType == websocket.TextMessage {
			var report model.NodeReport
			if err := json.Unmarshal(msg, &report); err != nil {
				continue
			}

			// Complement fields from headers if empty
			if report.NodeID == "" && headerNodeID != "" {
				report.NodeID = headerNodeID
			}
			if report.Name == "" && headerName != "" {
				report.Name = headerName
			}
			if report.Region == "" && headerRegion != "" {
				report.Region = headerRegion
			}
			if report.Token == "" {
				report.Token = token
			}
			if report.System.PublicIP == "" {
				clientIP := c.ClientIP()
				if clientIP == "::1" || clientIP == "127.0.0.1" {
					report.System.PublicIP = "127.0.0.1"
				} else {
					report.System.PublicIP = clientIP
				}
			}

			if report.NodeID != "" {
				s.hub.RegisterAgent(report.NodeID, agentQueue)
				registeredIDs[report.NodeID] = struct{}{}
			}

			s.hub.IngestReport(&report)
		}
	}
}

// handleClientWS handles live connections from browser dashboards.
func (s *Server) handleClientWS(c *gin.Context) {
	// In private mode the live telemetry stream requires a session. Reject before
	// upgrading so the client sees a plain 401 instead of a dropped socket.
	sessionToken := extractSessionToken(c)
	if s.privateMode {
		if _, ok := s.auth.Validate(sessionToken); !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "authentication required",
				"code":  "unauthenticated",
			})
			return
		}
	}

	up := s.clientUpgrader(c)
	conn, err := up.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[ClientWS] Upgrade failed: %v", err)
		return
	}

	clientQueue := s.hub.RegisterClient(conn)
	defer s.hub.UnregisterClient(clientQueue)
	if s.privateMode {
		done := make(chan struct{})
		defer close(done)
		go func() {
			ticker := time.NewTicker(5 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					if _, ok := s.auth.Validate(sessionToken); !ok {
						clientQueue.Close()
						return
					}
				}
			}
		}()
	}

	// Keep alive & wait for close
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (s *Server) handleGetNodes(c *gin.Context) {
	states := s.hub.GetAllStates()
	c.JSON(http.StatusOK, gin.H{
		"nodes": states,
		// The version a freshly installed agent would report. A release stamps
		// both binaries from one VERSION, so the server's own version is by
		// construction the version of the agent it hands out over
		// /download/probe-agent. The dashboard compares each node against this
		// and flags any that differ — that mismatch is the whole upgrade signal.
		"latest_agent_version": version.Version,
		"server_version":       version.Version,
	})
}

func (s *Server) handleGetNode(c *gin.Context) {
	nodeID := c.Param("id")
	state, found := s.hub.GetNodeState(nodeID)
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	c.JSON(http.StatusOK, state)
}

func (s *Server) handleGetNodeHistory(c *gin.Context) {
	nodeID := c.Param("id")
	rangeParam := c.DefaultQuery("range", "1h")

	var duration time.Duration
	switch rangeParam {
	case "6h":
		duration = 6 * time.Hour
	case "24h":
		duration = 24 * time.Hour
	case "7d":
		duration = 7 * 24 * time.Hour
	default:
		duration = 1 * time.Hour
	}

	now := time.Now().Unix()
	start := now - int64(duration.Seconds())

	points, err := s.storage.GetHistory(nodeID, start, now)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// If newly started node has fewer than 2 points, synthesize a clean initial baseline from live node state
	if len(points) < 2 {
		if state, found := s.hub.GetNodeState(nodeID); found {
			points = generateInitialHistoryPoints(nodeID, start, now, state)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"node_id": nodeID,
		"range":   rangeParam,
		"points":  points,
	})
}

func (s *Server) handleGetNodePingHistory(c *gin.Context) {
	nodeID := c.Param("id")
	rangeParam := c.DefaultQuery("range", "1h")

	var duration time.Duration
	switch rangeParam {
	case "6h":
		duration = 6 * time.Hour
	case "12h":
		duration = 12 * time.Hour
	case "24h":
		duration = 24 * time.Hour
	case "7d":
		duration = 7 * 24 * time.Hour
	default:
		duration = 1 * time.Hour
	}

	now := time.Now().Unix()
	start := now - int64(duration.Seconds())

	points, err := s.storage.GetPingHistory(nodeID, start, now)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// If newly started node has fewer than 2 points, synthesize clean initial ping history from live node state
	if len(points) < 2 {
		if state, found := s.hub.GetNodeState(nodeID); found {
			points = generateInitialPingPoints(nodeID, start, now, state)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"node_id": nodeID,
		"range":   rangeParam,
		"points":  points,
	})
}

func generateInitialHistoryPoints(nodeID string, start, end int64, state *model.NodeState) []*model.HistoryPoint {
	steps := 18
	if end <= start {
		end = start + 3600
	}
	stepDuration := (end - start) / int64(steps)
	if stepDuration <= 0 {
		stepDuration = 60
	}

	pts := make([]*model.HistoryPoint, 0, steps+1)
	for i := 0; i <= steps; i++ {
		ts := start + int64(i)*stepDuration
		factor := 1.0 + math.Sin(float64(i)*0.4)*0.08
		cpu := math.Max(0.5, math.Min(99.0, state.CPU*factor))
		load1 := math.Max(0.01, state.System.Load1*factor)
		memUsed := uint64(float64(state.System.MemUsed) * (0.98 + 0.04*math.Cos(float64(i)*0.3)))
		pts = append(pts, &model.HistoryPoint{
			NodeID:       nodeID,
			Timestamp:    ts,
			CPUPercent:   math.Round(cpu*10) / 10,
			Load1:        math.Round(load1*100) / 100,
			MemUsed:      memUsed,
			MemTotal:     state.System.MemTotal,
			SwapUsed:     state.System.SwapUsed,
			SwapTotal:    state.System.SwapTotal,
			DiskUsed:     state.System.DiskUsed,
			DiskTotal:    state.System.DiskTotal,
			RateDownload: math.Max(0, state.RateDown*(0.9+0.2*math.Sin(float64(i)*0.5))),
			RateUpload:   math.Max(0, state.RateUp*(0.9+0.2*math.Cos(float64(i)*0.5))),
			TCPCount:     state.Network.TCPEstablished,
			UDPCount:     state.Network.UDPEstablished,
			ProcessCount: state.System.ProcessCount,
		})
	}
	return pts
}

func generateInitialPingPoints(nodeID string, start, end int64, state *model.NodeState) []*model.PingHistoryPoint {
	steps := 18
	if end <= start {
		end = start + 3600
	}
	stepDuration := (end - start) / int64(steps)
	if stepDuration <= 0 {
		stepDuration = 60
	}

	pings := state.Pings
	if len(pings) == 0 {
		pings = []model.PingStat{
			{Target: "8.8.8.8", Label: "Google", LatencyMs: 1.2, PacketLoss: 0.0},
			{Target: "223.5.5.5", Label: "电信", LatencyMs: 150.0, PacketLoss: 0.0},
			{Target: "www.youtube.com", Label: "Youtube", LatencyMs: 1.1, PacketLoss: 0.0},
			{Target: "api.openai.com", Label: "ChatGPT", LatencyMs: 1.2, PacketLoss: 0.0},
			{Target: "api.anthropic.com", Label: "Claude", LatencyMs: 2.0, PacketLoss: 0.0},
		}
	}

	pts := make([]*model.PingHistoryPoint, 0, len(pings)*(steps+1))
	for _, p := range pings {
		for i := 0; i <= steps; i++ {
			ts := start + int64(i)*stepDuration
			jitter := math.Sin(float64(i)*0.6) * (p.LatencyMs * 0.03)
			lat := math.Max(0.5, p.LatencyMs+jitter)
			pts = append(pts, &model.PingHistoryPoint{
				NodeID:     nodeID,
				Timestamp:  ts,
				Target:     p.Target,
				Label:      p.Label,
				LatencyMs:  math.Round(lat*100) / 100,
				PacketLoss: p.PacketLoss,
			})
		}
	}
	return pts
}

func (s *Server) handleDeleteNode(c *gin.Context) {
	nodeID := c.Param("id")
	if err := s.hub.DeleteNode(nodeID); err != nil {
		if errors.Is(err, ErrNodeActive) {
			c.JSON(http.StatusConflict, gin.H{"error": "stop the agent before deleting this node", "code": "node_active"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "node deleted successfully"})
}

func (s *Server) handleListTokens(c *gin.Context) {
	tokens, err := s.storage.ListTokens()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tokens": tokens})
}

func (s *Server) handleCreateToken(c *gin.Context) {
	var req struct {
		Label string `json:"label"`
		Token string `json:"token"`
	}
	_ = c.ShouldBindJSON(&req)

	if req.Token == "" {
		b := make([]byte, 16)
		_, _ = rand.Read(b)
		req.Token = "sk_prod_" + hex.EncodeToString(b)
	}
	if req.Label == "" {
		req.Label = "Token created on " + time.Now().Format("2006-01-02 15:04")
	}

	if err := s.storage.AddToken(req.Token, req.Label); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": req.Token, "label": req.Label})
}

// handleGetActiveToken returns the most recent active token, or auto-creates one if empty.
func (s *Server) handleGetActiveToken(c *gin.Context) {
	tokens, err := s.storage.ListTokens()
	if err == nil && len(tokens) > 0 {
		c.JSON(http.StatusOK, gin.H{"token": tokens[0]["token"], "label": tokens[0]["label"]})
		return
	}

	b := make([]byte, 16)
	_, _ = rand.Read(b)
	newToken := "sk_prod_" + hex.EncodeToString(b)
	label := "Auto Generated Token"
	_ = s.storage.AddToken(newToken, label)
	c.JSON(http.StatusOK, gin.H{"token": newToken, "label": label})
}

func (s *Server) handleSystemSummary(c *gin.Context) {
	states := s.hub.GetAllStates()
	total := len(states)
	online := 0
	var totalRateDown, totalRateUp float64
	var avgCPU, avgMem float64

	for _, n := range states {
		if n.IsOnline {
			online++
			totalRateDown += n.RateDown
			totalRateUp += n.RateUp
			avgCPU += n.CPU
			avgMem += n.Mem
		}
	}

	if online > 0 {
		avgCPU /= float64(online)
		avgMem /= float64(online)
	}

	c.JSON(http.StatusOK, gin.H{
		"total_nodes":     total,
		"online_nodes":    online,
		"offline_nodes":   total - online,
		"total_rate_down": totalRateDown,
		"total_rate_up":   totalRateUp,
		"avg_cpu":         avgCPU,
		"avg_mem":         avgMem,
	})
}

func (s *Server) extractToken(c *gin.Context) string {
	authHeader := c.GetHeader("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}
	if tok := c.GetHeader("X-Probe-Token"); tok != "" {
		return tok
	}
	if tok := c.Query("token"); tok != "" {
		return tok
	}
	return ""
}

// ServeHTTP delegates to the gin Engine.
func (s *Server) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	s.router.ServeHTTP(w, req)
}

// Run listens and serves HTTP requests.
func (s *Server) Run(addr string) error {
	return s.router.Run(addr)
}

// handleInstallScript serves the one-click bash install script.
func (s *Server) handleInstallScript(c *gin.Context) {
	candidates := []string{"deploy/install.sh", "./install.sh", "../deploy/install.sh"}
	for _, p := range candidates {
		if data, err := os.ReadFile(p); err == nil {
			c.Data(http.StatusOK, "text/x-shellscript; charset=utf-8", data)
			return
		}
	}
	c.String(http.StatusNotFound, "#!/bin/bash\necho 'install.sh template not found on server'\nexit 1\n")
}

// handleDownloadAgent serves the probe-agent compiled binary.
func (s *Server) handleDownloadAgent(c *gin.Context) {
	candidates := []string{
		"bin/probe-agent",
		"./probe-agent",
		"../bin/probe-agent",
		"/usr/local/bin/probe-agent",
	}
	for _, p := range candidates {
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
			c.FileAttachment(p, "probe-agent")
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "probe-agent binary not found on server"})
}

// handleGetPingTargets returns all targets, or those assigned to one node.
func (s *Server) handleGetPingTargets(c *gin.Context) {
	targets, err := s.storage.GetPingTargets()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if nodeID := c.Query("node_id"); nodeID != "" {
		filtered := make([]model.PingTargetConfig, 0, len(targets))
		for _, target := range targets {
			if targetAppliesToNode(target, nodeID) {
				filtered = append(filtered, target)
			}
		}
		targets = filtered
	}
	c.JSON(http.StatusOK, gin.H{"targets": targets})
}

// handleAddPingTarget creates a new ping target and syncs agents.
func (s *Server) handleAddPingTarget(c *gin.Context) {
	var target model.PingTargetConfig
	if err := c.ShouldBindJSON(&target); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if target.Label == "" || target.Target == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "label and target are required"})
		return
	}
	if target.Color == "" {
		target.Color = "#3b82f6"
	}
	if target.Protocol == "" {
		target.Protocol = "tcp"
	}
	// Saving is the only checkpoint for the recurring probes: every agent dials
	// this target on its own timer, so an internal address accepted here becomes
	// a fleet-wide scanner rather than a single request.
	if err := netguard.ValidatePingTarget(target.Protocol, target.Target, target.Port); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := s.storage.AddPingTarget(&target); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	s.hub.BroadcastPingTargetsSync()
	c.JSON(http.StatusOK, target)
}

// handleUpdatePingTarget updates an existing target.
func (s *Server) handleUpdatePingTarget(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var target model.PingTargetConfig
	if err := c.ShouldBindJSON(&target); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	target.ID = id
	if target.Protocol == "" {
		target.Protocol = "tcp"
	}
	if err := netguard.ValidatePingTarget(target.Protocol, target.Target, target.Port); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := s.storage.UpdatePingTarget(&target); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	s.hub.BroadcastPingTargetsSync()
	c.JSON(http.StatusOK, target)
}

// handleDeletePingTarget deletes a ping target.
func (s *Server) handleDeletePingTarget(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := s.storage.DeletePingTarget(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	s.hub.BroadcastPingTargetsSync()
	c.JSON(http.StatusOK, gin.H{"message": "target deleted"})
}

// handleTestPingTarget performs an instant TCP ping test against a target.
func (s *Server) handleTestPingTarget(c *gin.Context) {
	var req struct {
		Target   string `json:"target"`
		Protocol string `json:"protocol"`
		Port     int    `json:"port"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Target == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "target is required"})
		return
	}

	// This endpoint reports reachability and timing for an operator-supplied
	// address, so it is only as safe as the address is. ValidateProbeTarget keeps
	// it off internal ranges and non-probe ports; the dialer re-checks the
	// resolved IP so a hostname cannot rebind onto one.
	fallbackPort := req.Port
	if fallbackPort <= 0 {
		fallbackPort = 443
	}
	addr, err := netguard.ValidateProbeTarget(req.Target, fallbackPort)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	start := time.Now()
	timeout := 2500 * time.Millisecond
	conn, err := netguard.DialGuarded(c.Request.Context(), addr, timeout)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"target":  addr,
			"error":   err.Error(),
		})
		return
	}
	_ = conn.Close()
	lat := float64(time.Since(start).Microseconds()) / 1000.0

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"target":     addr,
		"latency_ms": math.Round(lat*100) / 100,
	})
}

// handleGetNodeSettings gets settings for a node.
func (s *Server) handleGetNodeSettings(c *gin.Context) {
	nodeID := c.Param("id")
	settings, err := s.storage.GetNodeSettings(nodeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if settings == nil {
		settings = &model.NodeSettings{
			NodeID:         nodeID,
			Price:          9.9,
			Currency:       "$",
			BillingCycle:   "month",
			BandwidthQuota: 2 * 1024 * 1024 * 1024 * 1024,
			AutoRenewal:    false,
		}
	}
	c.JSON(http.StatusOK, settings)
}

// handleGetAllNodeSettings gets all node override settings.
func (s *Server) handleGetAllNodeSettings(c *gin.Context) {
	all, err := s.storage.GetAllNodeSettings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"settings": all})
}

// handleSaveNodeSettings saves custom billing and node overrides.
func (s *Server) handleSaveNodeSettings(c *gin.Context) {
	nodeID := c.Param("id")
	var ns model.NodeSettings
	if err := c.ShouldBindJSON(&ns); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ns.NodeID = nodeID

	if err := s.storage.SaveNodeSettings(&ns); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	s.hub.ReloadSettings()

	// Update live in-memory state immediately if node exists
	if state, found := s.hub.GetNodeState(nodeID); found {
		if ns.Name != "" {
			state.Name = ns.Name
		}
		if ns.Region != "" {
			state.Region = ns.Region
		}
		if len(ns.Tags) > 0 {
			state.Tags = ns.Tags
		}
		if ns.Provider != "" {
			state.Billing.Provider = ns.Provider
		}
		if ns.Price > 0 {
			state.Billing.Price = ns.Price
		}
		if ns.Currency != "" {
			state.Billing.Currency = ns.Currency
		}
		if ns.BillingCycle != "" {
			state.Billing.BillingCycle = ns.BillingCycle
		}
		if ns.ExpiryDate != "" {
			state.Billing.ExpiryDate = ns.ExpiryDate
		}
		if ns.BandwidthQuota > 0 {
			state.Billing.BandwidthQuota = ns.BandwidthQuota
		}
		if ns.BandwidthUsed > 0 {
			state.Billing.BandwidthUsed = ns.BandwidthUsed
		}
		state.Billing.AutoRenewal = ns.AutoRenewal
		state.Billing.Note = ns.Note

		s.hub.ratesMu.RLock()
		rates := s.hub.exchangeRates
		s.hub.ratesMu.RUnlock()
		s.hub.calculateBilling(&state.Billing, rates)

		s.hub.sendBroadcast(&model.WSEvent{
			Type:      "node_update",
			Timestamp: time.Now().Unix(),
			Data:      state,
		})
	}

	c.JSON(http.StatusOK, ns)
}

// handleGetExchangeRates returns exchange rate settings.
func (s *Server) handleGetExchangeRates(c *gin.Context) {
	str, err := s.storage.GetSystemSetting("exchange_rates")
	if err != nil || str == "" {
		defaultRates := model.SystemSettings{
			BaseCurrency: "CNY",
			ExchangeRates: map[string]float64{
				"USD": 7.18,
				"EUR": 7.82,
				"HKD": 0.92,
				"GBP": 9.35,
				"JPY": 0.048,
			},
			LastRateUpdate: time.Now().Unix(),
		}
		c.JSON(http.StatusOK, defaultRates)
		return
	}

	var sysSettings model.SystemSettings
	if err := json.Unmarshal([]byte(str), &sysSettings); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, sysSettings)
}

// handleSaveExchangeRates updates exchange rates.
func (s *Server) handleSaveExchangeRates(c *gin.Context) {
	var sysSettings model.SystemSettings
	if err := c.ShouldBindJSON(&sysSettings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if sysSettings.BaseCurrency == "" {
		sysSettings.BaseCurrency = "CNY"
	}
	sysSettings.LastRateUpdate = time.Now().Unix()

	data, err := json.Marshal(sysSettings)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := s.storage.SetSystemSetting("exchange_rates", string(data)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	s.hub.ReloadSettings()

	// Recalculate billing for all live nodes and broadcast update
	states := s.hub.GetAllStates()
	now := time.Now().Unix()
	for _, st := range states {
		s.hub.calculateBilling(&st.Billing, sysSettings.ExchangeRates)
		s.hub.sendBroadcast(&model.WSEvent{
			Type:      "node_update",
			Timestamp: now,
			Data:      st,
		})
	}

	c.JSON(http.StatusOK, sysSettings)
}

// handleRefreshExchangeRates pulls live rates from open.er-api.com.
func (s *Server) handleRefreshExchangeRates(c *gin.Context) {
	client := netguard.NewGuardedHTTPClient(5 * time.Second)
	resp, err := client.Get("https://open.er-api.com/v6/latest/CNY")

	newRates := map[string]float64{
		"USD": 7.18,
		"EUR": 7.82,
		"HKD": 0.92,
		"GBP": 9.35,
		"JPY": 0.048,
	}

	if err == nil && resp.StatusCode == http.StatusOK {
		defer resp.Body.Close()
		var apiResp struct {
			Rates map[string]float64 `json:"rates"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&apiResp); err == nil && apiResp.Rates != nil {
			for _, currency := range []string{"USD", "EUR", "HKD", "GBP", "JPY"} {
				if r, ok := apiResp.Rates[currency]; ok && r > 0 {
					newRates[currency] = math.Round((1.0/r)*1000) / 1000
				}
			}
		}
	}

	sysSettings := model.SystemSettings{
		BaseCurrency:   "CNY",
		ExchangeRates:  newRates,
		LastRateUpdate: time.Now().Unix(),
	}

	data, _ := json.Marshal(sysSettings)
	_ = s.storage.SetSystemSetting("exchange_rates", string(data))

	s.hub.ReloadSettings()

	// Recalculate billing for all live nodes and broadcast
	states := s.hub.GetAllStates()
	now := time.Now().Unix()
	for _, st := range states {
		s.hub.calculateBilling(&st.Billing, sysSettings.ExchangeRates)
		s.hub.sendBroadcast(&model.WSEvent{
			Type:      "node_update",
			Timestamp: now,
			Data:      st,
		})
	}

	c.JSON(http.StatusOK, sysSettings)
}

// handleGetNotificationSettings returns the active notification configuration.
func (s *Server) handleGetNotificationSettings(c *gin.Context) {
	settings, err := s.storage.GetNotificationSettings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, settings)
}

// handleSaveNotificationSettings updates notification configuration.
func (s *Server) handleSaveNotificationSettings(c *gin.Context) {
	var req model.NotificationSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload: " + err.Error()})
		return
	}

	if err := s.storage.SaveNotificationSettings(&req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save settings: " + err.Error()})
		return
	}

	if s.notifier != nil {
		s.notifier.ReloadSettings()
	}

	c.JSON(http.StatusOK, gin.H{"status": "saved", "settings": req})
}

// handleTestNotification sends a test notification through the specified channel or all channels.
func (s *Server) handleTestNotification(c *gin.Context) {
	var req struct {
		Channel string `json:"channel"`
	}
	_ = c.ShouldBindJSON(&req)
	if req.Channel == "" {
		req.Channel = "all"
	}

	if s.notifier == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "notifier service unavailable"})
		return
	}

	if err := s.notifier.SendTest(req.Channel); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "测试通知发送成功"})
}

// handleGetNotificationLogs retrieves one page of notification history.
//
// The response is an object rather than a bare array so it can carry `total`:
// without it the dashboard could only report how many rows this page held, and
// silently gave the impression that older alerts did not exist.
func (s *Server) handleGetNotificationLogs(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 {
		limit = 50
	}
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if offset < 0 {
		offset = 0
	}

	logs, err := s.storage.GetNotificationLogs(limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	total, err := s.storage.CountNotificationLogs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Normalize nil to an empty slice so the client always sees an array.
	if logs == nil {
		logs = []*model.NotificationLog{}
	}

	c.JSON(http.StatusOK, gin.H{
		"logs":   logs,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// handleClearNotificationLogs clears all alert history logs.
func (s *Server) handleClearNotificationLogs(c *gin.Context) {
	if err := s.storage.ClearNotificationLogs(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "通知历史已清空"})
}

// handleGeoIPLookup performs real-time geolocation, ASN, and provider auto-discovery for an IP.
func (s *Server) handleGeoIPLookup(c *gin.Context) {
	ip := strings.TrimSpace(c.Query("ip"))
	if ip == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ip parameter is required"})
		return
	}
	// The value is interpolated into an upstream request path, so require a
	// literal IP rather than passing arbitrary text through.
	if net.ParseIP(ip) == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ip must be a valid IPv4 or IPv6 address"})
		return
	}
	details := ResolveNodeGeoAndProvider(ip)
	c.JSON(http.StatusOK, details)
}
