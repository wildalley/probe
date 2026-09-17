package server

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"probe/pkg/model"

	_ "modernc.org/sqlite"
)

// Storage handles persistent SQLite database operations with zero CGO dependencies.
type Storage struct {
	db *sql.DB
	mu sync.RWMutex
}

// NewStorage initializes SQLite and ensures schemas exist.
func NewStorage(dbPath string) (*Storage, error) {
	// Enable WAL mode and busy timeout for high concurrent read performance
	dsn := fmt.Sprintf("%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)", dbPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(time.Hour)

	s := &Storage{db: db}
	if err := s.initSchema(); err != nil {
		db.Close()
		return nil, err
	}

	return s, nil
}

func (s *Storage) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS nodes (
		node_id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		token TEXT NOT NULL,
		region TEXT,
		tags TEXT,
		os TEXT,
		kernel TEXT,
		agent_version TEXT DEFAULT '',
		is_online INTEGER DEFAULT 0,
		last_seen INTEGER DEFAULT 0,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS history_points (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id TEXT NOT NULL,
		timestamp INTEGER NOT NULL,
		cpu_percent REAL,
		load_1 REAL DEFAULT 0,
		mem_used INTEGER DEFAULT 0,
		mem_total INTEGER DEFAULT 0,
		swap_used INTEGER DEFAULT 0,
		swap_total INTEGER DEFAULT 0,
		disk_used INTEGER DEFAULT 0,
		disk_total INTEGER DEFAULT 0,
		rate_down REAL DEFAULT 0,
		rate_up REAL DEFAULT 0,
		tcp_count INTEGER DEFAULT 0,
		udp_count INTEGER DEFAULT 0,
		process_count INTEGER DEFAULT 0
	);

	CREATE INDEX IF NOT EXISTS idx_history_node_time ON history_points(node_id, timestamp);

	CREATE TABLE IF NOT EXISTS ping_points (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id TEXT NOT NULL,
		timestamp INTEGER NOT NULL,
		target TEXT NOT NULL,
		label TEXT NOT NULL,
		latency_ms REAL NOT NULL,
		packet_loss REAL NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_ping_node_time ON ping_points(node_id, timestamp);

	CREATE TABLE IF NOT EXISTS tokens (
		token TEXT PRIMARY KEY,
		label TEXT,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS ping_targets (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		label TEXT NOT NULL,
		target TEXT NOT NULL,
		color TEXT NOT NULL,
		protocol TEXT DEFAULT 'tcp',
		port INTEGER DEFAULT 443,
		interval INTEGER DEFAULT 60,
		servers TEXT DEFAULT '',
		auto_start INTEGER DEFAULT 1,
		assigned_servers TEXT DEFAULT '',
		enabled INTEGER DEFAULT 1,
		sort_order INTEGER DEFAULT 0,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS node_settings (
		node_id TEXT PRIMARY KEY,
		name TEXT,
		region TEXT,
		tags TEXT,
		provider TEXT,
		public_ip TEXT,
		price REAL DEFAULT 0,
		currency TEXT DEFAULT '$',
		billing_cycle TEXT DEFAULT 'month',
		expiry_date TEXT,
		bandwidth_quota INTEGER DEFAULT 0,
		bandwidth_used INTEGER DEFAULT 0,
		auto_renewal INTEGER DEFAULT 0,
		note TEXT DEFAULT '',
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS system_settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS notification_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp INTEGER NOT NULL,
		channel TEXT NOT NULL,
		type TEXT NOT NULL,
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		status TEXT NOT NULL,
		error_msg TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_notify_logs_time ON notification_logs(timestamp DESC);

	CREATE TABLE IF NOT EXISTS admin_users (
		username TEXT PRIMARY KEY,
		password_hash TEXT NOT NULL,
		must_change_password INTEGER DEFAULT 0,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS sessions (
		token_hash TEXT PRIMARY KEY,
		username TEXT NOT NULL,
		expires_at INTEGER NOT NULL,
		client_ip TEXT,
		user_agent TEXT,
		created_at INTEGER NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username);
	CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
	`
	_, err := s.db.Exec(schema)
	if err != nil {
		return fmt.Errorf("failed to initialize schema: %w", err)
	}

	// Dynamic column migrations if table previously had fewer columns
	s.migrateTableColumns()
	if err := s.requireColumns(); err != nil {
		return err
	}
	if err := s.initializeTargetAssignments(); err != nil {
		return fmt.Errorf("failed to initialize ping target assignments: %w", err)
	}

	// Insert default token if none exists. This is generated per-install rather
	// than hardcoded: a fixed literal shipped in the source is a known secret,
	// so anyone reading the repo could impersonate an agent on any deployment.
	var count int
	_ = s.db.QueryRow("SELECT COUNT(*) FROM tokens").Scan(&count)
	if count == 0 {
		buf := make([]byte, 16)
		if _, err := rand.Read(buf); err != nil {
			return fmt.Errorf("failed to generate initial agent token: %w", err)
		}
		defaultToken := "sk_agent_" + hex.EncodeToString(buf)
		_ = s.AddToken(defaultToken, "Default System Token")
		log.Printf("[Storage] Generated initial agent token: %s", defaultToken)
	}

	// Seed default ping targets if table is empty
	var pingCount int
	_ = s.db.QueryRow("SELECT COUNT(*) FROM ping_targets").Scan(&pingCount)
	if pingCount == 0 {
		now := time.Now().Unix()
		targets := []model.PingTargetConfig{
			{Label: "Google", Target: "8.8.8.8:53", Color: "#ef4444", Protocol: "tcp", Port: 53, Interval: 60, AutoStart: true, Enabled: true, CreatedAt: now},
			{Label: "电信", Target: "223.5.5.5:53", Color: "#06b6d4", Protocol: "tcp", Port: 53, Interval: 60, AutoStart: true, Enabled: true, CreatedAt: now},
			{Label: "Youtube", Target: "www.youtube.com:443", Color: "#a855f7", Protocol: "tcp", Port: 443, Interval: 60, AutoStart: true, Enabled: true, CreatedAt: now},
			{Label: "ChatGPT", Target: "api.openai.com:443", Color: "#3b82f6", Protocol: "tcp", Port: 443, Interval: 60, AutoStart: true, Enabled: true, CreatedAt: now},
			{Label: "Claude", Target: "api.anthropic.com:443", Color: "#f97316", Protocol: "tcp", Port: 443, Interval: 60, AutoStart: true, Enabled: true, CreatedAt: now},
		}
		for i, t := range targets {
			_, _ = s.db.Exec(`INSERT INTO ping_targets (label, target, color, protocol, port, interval, servers, auto_start, enabled, sort_order, created_at)
				VALUES (?, ?, ?, ?, ?, ?, '', 1, ?, ?, ?)`,
				t.Label, t.Target, t.Color, t.Protocol, t.Port, t.Interval, 1, i+1, t.CreatedAt)
		}
		log.Printf("[Storage] Seeded %d default ping monitoring targets", len(targets))
	}

	// Seed default exchange rates if none exist
	var rateCount int
	_ = s.db.QueryRow("SELECT COUNT(*) FROM system_settings WHERE key = 'exchange_rates'").Scan(&rateCount)
	if rateCount == 0 {
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
		if data, err := json.Marshal(defaultRates); err == nil {
			_, _ = s.db.Exec("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('exchange_rates', ?)", string(data))
		}
	}

	return nil
}

func (s *Storage) migrateTableColumns() {
	cols := []string{
		"ALTER TABLE history_points ADD COLUMN load_1 REAL DEFAULT 0",
		"ALTER TABLE history_points ADD COLUMN mem_used INTEGER DEFAULT 0",
		"ALTER TABLE history_points ADD COLUMN mem_total INTEGER DEFAULT 0",
		"ALTER TABLE history_points ADD COLUMN swap_used INTEGER DEFAULT 0",
		"ALTER TABLE history_points ADD COLUMN swap_total INTEGER DEFAULT 0",
		"ALTER TABLE history_points ADD COLUMN disk_used INTEGER DEFAULT 0",
		"ALTER TABLE history_points ADD COLUMN disk_total INTEGER DEFAULT 0",
		"ALTER TABLE history_points ADD COLUMN tcp_count INTEGER DEFAULT 0",
		"ALTER TABLE history_points ADD COLUMN udp_count INTEGER DEFAULT 0",
		"ALTER TABLE history_points ADD COLUMN process_count INTEGER DEFAULT 0",
		"ALTER TABLE ping_targets ADD COLUMN interval INTEGER DEFAULT 60",
		"ALTER TABLE ping_targets ADD COLUMN servers TEXT DEFAULT ''",
		"ALTER TABLE ping_targets ADD COLUMN auto_start INTEGER DEFAULT 1",
		"ALTER TABLE ping_targets ADD COLUMN assigned_servers TEXT DEFAULT ''",
		"ALTER TABLE node_settings ADD COLUMN bandwidth_used INTEGER DEFAULT 0",
		"ALTER TABLE node_settings ADD COLUMN note TEXT DEFAULT ''",
		// First entry against the nodes table. Re-running is harmless because the
		// error from a duplicate column is swallowed below, which is what makes
		// this whole slice idempotent.
		"ALTER TABLE nodes ADD COLUMN agent_version TEXT DEFAULT ''",
	}
	for _, sqlStmt := range cols {
		_, _ = s.db.Exec(sqlStmt)
	}
}

// requireColumns asserts that migrateTableColumns actually landed.
func (s *Storage) requireColumns() error {
	required := []struct {
		table string
		col   string
	}{
		{"nodes", "agent_version"},
		{"node_settings", "note"},
	}
	for _, req := range required {
		found, err := s.columnExists(req.table, req.col)
		if err != nil {
			return fmt.Errorf("failed to verify schema: %w", err)
		}
		if !found {
			return fmt.Errorf("schema migration incomplete: %s.%s is missing", req.table, req.col)
		}
	}
	return nil
}

func (s *Storage) columnExists(table, column string) (bool, error) {
	rows, err := s.db.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return false, err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			cid        int
			name       string
			ctype      string
			notNull    int
			defaultVal sql.NullString
			pk         int
		)
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &defaultVal, &pk); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}
	return false, rows.Err()
}

// initializeTargetAssignments freezes the current node set for legacy targets
// that disabled auto-start before assignments were persisted.
func (s *Storage) initializeTargetAssignments() error {
	nodeIDs, err := s.existingNodeIDs()
	if err != nil {
		return err
	}
	assigned, err := json.Marshal(nodeIDs)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`UPDATE ping_targets SET assigned_servers = ?
		WHERE auto_start = 0 AND (servers = '' OR servers = '[]') AND assigned_servers = ''`, string(assigned))
	return err
}

func (s *Storage) existingNodeIDs() ([]string, error) {
	rows, err := s.db.Query("SELECT node_id FROM nodes")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ValidateToken checks if a token is valid.
func (s *Storage) ValidateToken(token string) bool {
	if token == "" {
		return false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()

	var exists int
	err := s.db.QueryRow("SELECT 1 FROM tokens WHERE token = ?", token).Scan(&exists)
	return err == nil && exists == 1
}

// AddToken registers a new token.
func (s *Storage) AddToken(token, label string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec("INSERT INTO tokens (token, label, created_at) VALUES (?, ?, ?)",
		token, label, time.Now().Unix())
	return err
}

// ListTokens returns all valid tokens.
func (s *Storage) ListTokens() ([]map[string]interface{}, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query("SELECT token, label, created_at FROM tokens ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []map[string]interface{}
	for rows.Next() {
		var token, label string
		var createdAt int64
		if err := rows.Scan(&token, &label, &createdAt); err == nil {
			result = append(result, map[string]interface{}{
				"token":      token,
				"label":      label,
				"created_at": createdAt,
			})
		}
	}
	return result, nil
}

// UpsertNode creates or updates node metadata.
func (s *Storage) UpsertNode(meta *model.NodeMetadata) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().Unix()
	onlineInt := 0
	if meta.IsOnline {
		onlineInt = 1
	}

	query := `
	INSERT INTO nodes (node_id, name, token, region, os, kernel, agent_version, is_online, last_seen, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(node_id) DO UPDATE SET
		name = CASE WHEN excluded.name != '' THEN excluded.name ELSE nodes.name END,
		token = CASE WHEN excluded.token != '' THEN excluded.token ELSE nodes.token END,
		region = CASE WHEN excluded.region != '' THEN excluded.region ELSE nodes.region END,
		os = CASE WHEN excluded.os != '' THEN excluded.os ELSE nodes.os END,
		kernel = CASE WHEN excluded.kernel != '' THEN excluded.kernel ELSE nodes.kernel END,
		agent_version = CASE WHEN excluded.agent_version != '' THEN excluded.agent_version ELSE nodes.agent_version END,
		is_online = excluded.is_online,
		last_seen = excluded.last_seen;
	`
	_, err := s.db.Exec(query,
		meta.NodeID, meta.Name, meta.Token, meta.Region, meta.OS, meta.Kernel, meta.AgentVersion,
		onlineInt, meta.LastSeen, now,
	)
	return err
}

// GetAllNodes returns all registered nodes from database.
func (s *Storage) GetAllNodes() ([]*model.NodeMetadata, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(`SELECT node_id, name, token, region, os, kernel, agent_version, is_online, last_seen, created_at FROM nodes`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []*model.NodeMetadata
	for rows.Next() {
		var n model.NodeMetadata
		var isOnline int
		if err := rows.Scan(&n.NodeID, &n.Name, &n.Token, &n.Region, &n.OS, &n.Kernel, &n.AgentVersion, &isOnline, &n.LastSeen, &n.CreatedAt); err != nil {
			// Never silent: a scan failure drops the node from the fleet with no
			// other trace, and a column-count mismatch is exactly how that happens.
			log.Printf("[Storage] Skipping unreadable node row: %v", err)
			continue
		}
		n.IsOnline = (isOnline == 1)
		nodes = append(nodes, &n)
	}
	return nodes, nil
}

// DeleteNode removes a node and its history from SQLite.
func (s *Storage) DeleteNode(nodeID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, _ = s.db.Exec("DELETE FROM history_points WHERE node_id = ?", nodeID)
	_, _ = s.db.Exec("DELETE FROM ping_points WHERE node_id = ?", nodeID)
	_, err := s.db.Exec("DELETE FROM nodes WHERE node_id = ?", nodeID)
	return err
}

// InsertHistoryBatch inserts downsampled points in a single transaction.
func (s *Storage) InsertHistoryBatch(points []*model.HistoryPoint) error {
	if len(points) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO history_points (
			node_id, timestamp, cpu_percent, load_1, mem_used, mem_total,
			swap_used, swap_total, disk_used, disk_total, rate_down, rate_up,
			tcp_count, udp_count, process_count
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, p := range points {
		_, err := stmt.Exec(
			p.NodeID, p.Timestamp, p.CPUPercent, p.Load1, p.MemUsed, p.MemTotal,
			p.SwapUsed, p.SwapTotal, p.DiskUsed, p.DiskTotal, p.RateDownload, p.RateUpload,
			p.TCPCount, p.UDPCount, p.ProcessCount,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// InsertPingBatch inserts downsampled ping latency & loss in batch.
func (s *Storage) InsertPingBatch(points []*model.PingHistoryPoint) error {
	if len(points) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO ping_points (node_id, timestamp, target, label, latency_ms, packet_loss)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, p := range points {
		_, err := stmt.Exec(p.NodeID, p.Timestamp, p.Target, p.Label, p.LatencyMs, p.PacketLoss)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// GetHistory retrieves downsampled history points for a node in a given time window.
func (s *Storage) GetHistory(nodeID string, start, end int64) ([]*model.HistoryPoint, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(`
		SELECT timestamp, cpu_percent, load_1, mem_used, mem_total, swap_used, swap_total,
		       disk_used, disk_total, rate_down, rate_up, tcp_count, udp_count, process_count
		FROM history_points
		WHERE node_id = ? AND timestamp >= ? AND timestamp <= ?
		ORDER BY timestamp ASC
	`, nodeID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []*model.HistoryPoint
	for rows.Next() {
		p := &model.HistoryPoint{NodeID: nodeID}
		if err := rows.Scan(
			&p.Timestamp, &p.CPUPercent, &p.Load1, &p.MemUsed, &p.MemTotal,
			&p.SwapUsed, &p.SwapTotal, &p.DiskUsed, &p.DiskTotal,
			&p.RateDownload, &p.RateUpload, &p.TCPCount, &p.UDPCount, &p.ProcessCount,
		); err == nil {
			points = append(points, p)
		}
	}
	return points, nil
}

// GetPingHistory retrieves historical ping latency and loss for a node.
func (s *Storage) GetPingHistory(nodeID string, start, end int64) ([]*model.PingHistoryPoint, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(`
		SELECT timestamp, target, label, latency_ms, packet_loss
		FROM ping_points
		WHERE node_id = ? AND timestamp >= ? AND timestamp <= ?
		ORDER BY timestamp ASC
	`, nodeID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []*model.PingHistoryPoint
	for rows.Next() {
		p := &model.PingHistoryPoint{NodeID: nodeID}
		if err := rows.Scan(&p.Timestamp, &p.Target, &p.Label, &p.LatencyMs, &p.PacketLoss); err == nil {
			points = append(points, p)
		}
	}
	return points, nil
}

// PruneOldHistory deletes historical records older than given timestamp to prevent database bloat.
func (s *Storage) PruneOldHistory(beforeTimestamp int64) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, _ = s.db.Exec("DELETE FROM ping_points WHERE timestamp < ?", beforeTimestamp)
	res, err := s.db.Exec("DELETE FROM history_points WHERE timestamp < ?", beforeTimestamp)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// GetPingTargets returns all configured ping monitoring targets.
func (s *Storage) GetPingTargets() ([]model.PingTargetConfig, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(`SELECT id, label, target, color, protocol, port, interval, servers, auto_start, assigned_servers, enabled, created_at FROM ping_targets ORDER BY sort_order ASC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var targets []model.PingTargetConfig
	for rows.Next() {
		var t model.PingTargetConfig
		var enabledInt, autoStartInt int
		var serversJSON, assignedJSON string
		if err := rows.Scan(&t.ID, &t.Label, &t.Target, &t.Color, &t.Protocol, &t.Port, &t.Interval, &serversJSON, &autoStartInt, &assignedJSON, &enabledInt, &t.CreatedAt); err != nil {
			continue
		}
		if t.Interval <= 0 {
			t.Interval = 60
		}
		t.Enabled = (enabledInt == 1)
		t.AutoStart = (autoStartInt == 1)
		if serversJSON != "" {
			_ = json.Unmarshal([]byte(serversJSON), &t.Servers)
		}
		if t.Servers == nil {
			t.Servers = []string{}
		}
		if assignedJSON != "" {
			_ = json.Unmarshal([]byte(assignedJSON), &t.AssignedServers)
		}
		targets = append(targets, t)
	}
	return targets, nil
}

// AddPingTarget adds a new ping monitoring target.
func (s *Storage) AddPingTarget(t *model.PingTargetConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	enabledInt := 0
	if t.Enabled {
		enabledInt = 1
	}
	autoStartInt := 0
	if t.AutoStart {
		autoStartInt = 1
	}
	if t.Interval <= 0 {
		t.Interval = 60
	}
	if t.Servers == nil {
		t.Servers = []string{}
	}
	serversJSON, _ := json.Marshal(t.Servers)
	var assigned []string
	if !t.AutoStart && len(t.Servers) == 0 {
		var err error
		assigned, err = s.existingNodeIDs()
		if err != nil {
			return err
		}
	}
	t.AssignedServers = assigned
	assignedJSON, _ := json.Marshal(assigned)
	now := time.Now().Unix()
	res, err := s.db.Exec(`INSERT INTO ping_targets (label, target, color, protocol, port, interval, servers, auto_start, assigned_servers, enabled, sort_order, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM ping_targets), ?)`,
		t.Label, t.Target, t.Color, t.Protocol, t.Port, t.Interval, string(serversJSON), autoStartInt, string(assignedJSON), enabledInt, now)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err == nil {
		t.ID = id
		t.CreatedAt = now
	}
	return nil
}

// UpdatePingTarget updates an existing ping target.
func (s *Storage) UpdatePingTarget(t *model.PingTargetConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	enabledInt := 0
	if t.Enabled {
		enabledInt = 1
	}
	autoStartInt := 0
	if t.AutoStart {
		autoStartInt = 1
	}
	if t.Interval <= 0 {
		t.Interval = 60
	}
	if t.Servers == nil {
		t.Servers = []string{}
	}
	serversJSON, _ := json.Marshal(t.Servers)
	var assigned []string
	if !t.AutoStart && len(t.Servers) == 0 {
		var oldAutoStart int
		var oldServers, oldAssigned string
		err := s.db.QueryRow("SELECT auto_start, servers, assigned_servers FROM ping_targets WHERE id = ?", t.ID).Scan(&oldAutoStart, &oldServers, &oldAssigned)
		if err != nil {
			return err
		}
		if oldAutoStart == 0 && (oldServers == "" || oldServers == "[]") && oldAssigned != "" {
			if err := json.Unmarshal([]byte(oldAssigned), &assigned); err != nil {
				return err
			}
		} else {
			assigned, err = s.existingNodeIDs()
			if err != nil {
				return err
			}
		}
	}
	t.AssignedServers = assigned
	assignedJSON, _ := json.Marshal(assigned)
	_, err := s.db.Exec(`UPDATE ping_targets SET label = ?, target = ?, color = ?, protocol = ?, port = ?, interval = ?, servers = ?, auto_start = ?, assigned_servers = ?, enabled = ? WHERE id = ?`,
		t.Label, t.Target, t.Color, t.Protocol, t.Port, t.Interval, string(serversJSON), autoStartInt, string(assignedJSON), enabledInt, t.ID)
	return err
}

// DeletePingTarget removes a ping target.
func (s *Storage) DeletePingTarget(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM ping_targets WHERE id = ?`, id)
	return err
}

// GetNodeSettings retrieves billing and override settings for a specific node.
func (s *Storage) GetNodeSettings(nodeID string) (*model.NodeSettings, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	row := s.db.QueryRow(`SELECT node_id, name, region, tags, provider, public_ip, price, currency, billing_cycle, expiry_date, bandwidth_quota, bandwidth_used, auto_renewal, note, updated_at
		FROM node_settings WHERE node_id = ?`, nodeID)

	var ns model.NodeSettings
	var tagsJSON string
	var autoRenewInt int
	err := row.Scan(&ns.NodeID, &ns.Name, &ns.Region, &tagsJSON, &ns.Provider, &ns.PublicIP, &ns.Price, &ns.Currency, &ns.BillingCycle, &ns.ExpiryDate, &ns.BandwidthQuota, &ns.BandwidthUsed, &autoRenewInt, &ns.Note, &ns.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	ns.AutoRenewal = (autoRenewInt == 1)
	if tagsJSON != "" {
		_ = json.Unmarshal([]byte(tagsJSON), &ns.Tags)
	}
	return &ns, nil
}

// GetAllNodeSettings returns all node override settings mapped by node_id.
func (s *Storage) GetAllNodeSettings() (map[string]*model.NodeSettings, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(`SELECT node_id, name, region, tags, provider, public_ip, price, currency, billing_cycle, expiry_date, bandwidth_quota, bandwidth_used, auto_renewal, note, updated_at FROM node_settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make(map[string]*model.NodeSettings)
	for rows.Next() {
		var ns model.NodeSettings
		var tagsJSON string
		var autoRenewInt int
		if err := rows.Scan(&ns.NodeID, &ns.Name, &ns.Region, &tagsJSON, &ns.Provider, &ns.PublicIP, &ns.Price, &ns.Currency, &ns.BillingCycle, &ns.ExpiryDate, &ns.BandwidthQuota, &ns.BandwidthUsed, &autoRenewInt, &ns.Note, &ns.UpdatedAt); err != nil {
			continue
		}
		ns.AutoRenewal = (autoRenewInt == 1)
		if tagsJSON != "" {
			_ = json.Unmarshal([]byte(tagsJSON), &ns.Tags)
		}
		res[ns.NodeID] = &ns
	}
	return res, nil
}

// SaveNodeSettings creates or updates node billing and customization settings.
func (s *Storage) SaveNodeSettings(ns *model.NodeSettings) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().Unix()
	ns.UpdatedAt = now
	autoRenewInt := 0
	if ns.AutoRenewal {
		autoRenewInt = 1
	}
	tagsBytes, _ := json.Marshal(ns.Tags)

	_, err := s.db.Exec(`INSERT INTO node_settings (
		node_id, name, region, tags, provider, public_ip, price, currency, billing_cycle, expiry_date, bandwidth_quota, bandwidth_used, auto_renewal, note, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(node_id) DO UPDATE SET
		name = excluded.name,
		region = excluded.region,
		tags = excluded.tags,
		provider = excluded.provider,
		public_ip = excluded.public_ip,
		price = excluded.price,
		currency = excluded.currency,
		billing_cycle = excluded.billing_cycle,
		expiry_date = excluded.expiry_date,
		bandwidth_quota = excluded.bandwidth_quota,
		bandwidth_used = excluded.bandwidth_used,
		auto_renewal = excluded.auto_renewal,
		note = excluded.note,
		updated_at = excluded.updated_at`,
		ns.NodeID, ns.Name, ns.Region, string(tagsBytes), ns.Provider, ns.PublicIP, ns.Price, ns.Currency, ns.BillingCycle, ns.ExpiryDate, ns.BandwidthQuota, ns.BandwidthUsed, autoRenewInt, ns.Note, now)
	return err
}

// GetSystemSetting reads a key from system_settings.
func (s *Storage) GetSystemSetting(key string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var val string
	err := s.db.QueryRow(`SELECT value FROM system_settings WHERE key = ?`, key).Scan(&val)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return val, nil
}

// SetSystemSetting writes a key-value pair to system_settings.
func (s *Storage) SetSystemSetting(key, val string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)`, key, val)
	return err
}

// AdminUser represents a dashboard operator account.
type AdminUser struct {
	Username           string
	PasswordHash       string
	MustChangePassword bool
	CreatedAt          int64
	UpdatedAt          int64
}

// CountAdminUsers returns the number of provisioned operator accounts.
func (s *Storage) CountAdminUsers() (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM admin_users").Scan(&count)
	return count, err
}

// CreateAdminUser inserts a new operator account with a bcrypt password hash.
func (s *Storage) CreateAdminUser(username, passwordHash string, mustChange bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	mustChangeInt := 0
	if mustChange {
		mustChangeInt = 1
	}
	now := time.Now().Unix()
	_, err := s.db.Exec(`INSERT INTO admin_users (username, password_hash, must_change_password, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)`, username, passwordHash, mustChangeInt, now, now)
	return err
}

// GetAdminUser looks up an operator account. A nil user with nil error means "not found".
func (s *Storage) GetAdminUser(username string) (*AdminUser, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var u AdminUser
	var mustChangeInt int
	err := s.db.QueryRow(`SELECT username, password_hash, must_change_password, created_at, updated_at
		FROM admin_users WHERE username = ?`, username).
		Scan(&u.Username, &u.PasswordHash, &mustChangeInt, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	u.MustChangePassword = (mustChangeInt == 1)
	return &u, nil
}

// UpdateAdminPassword stores a new password hash and clears the forced-rotation flag.
func (s *Storage) UpdateAdminPassword(username, passwordHash string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`UPDATE admin_users SET password_hash = ?, must_change_password = 0, updated_at = ?
		WHERE username = ?`, passwordHash, time.Now().Unix(), username)
	return err
}

// ChangeAdminPasswordAndRevokeSessions commits the new hash and session
// invalidation together so a failed session delete cannot leave old sessions
// valid after a password change.
func (s *Storage) ChangeAdminPasswordAndRevokeSessions(username, passwordHash string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE admin_users SET password_hash = ?, must_change_password = 0, updated_at = ?
		WHERE username = ?`, passwordHash, time.Now().Unix(), username); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM sessions WHERE username = ?`, username); err != nil {
		return err
	}
	return tx.Commit()
}

// CreateSession persists a hashed session token.
func (s *Storage) CreateSession(tokenHash, username string, expiresAt int64, clientIP, userAgent string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(userAgent) > 255 {
		userAgent = userAgent[:255]
	}
	_, err := s.db.Exec(`INSERT INTO sessions (token_hash, username, expires_at, client_ip, user_agent, created_at)
		VALUES (?, ?, ?, ?, ?, ?)`, tokenHash, username, expiresAt, clientIP, userAgent, time.Now().Unix())
	return err
}

// GetSession resolves a hashed token to its owner and expiry.
func (s *Storage) GetSession(tokenHash string) (string, int64, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var username string
	var expiresAt int64
	err := s.db.QueryRow(`SELECT username, expires_at FROM sessions WHERE token_hash = ?`, tokenHash).
		Scan(&username, &expiresAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", 0, nil
		}
		return "", 0, err
	}
	return username, expiresAt, nil
}

// DeleteSession removes a single session (logout).
func (s *Storage) DeleteSession(tokenHash string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM sessions WHERE token_hash = ?`, tokenHash)
	return err
}

// DeleteSessionsForUser invalidates every session of a user, e.g. after a password change.
func (s *Storage) DeleteSessionsForUser(username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM sessions WHERE username = ?`, username)
	return err
}

// DeleteExpiredSessions prunes sessions past their expiry.
func (s *Storage) DeleteExpiredSessions(now int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM sessions WHERE expires_at <= ?`, now)
	return err
}

// DeleteToken revokes an agent token.
func (s *Storage) DeleteToken(token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM tokens WHERE token = ?`, token)
	return err
}

// CountTokens returns how many agent tokens exist.
func (s *Storage) CountTokens() (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM tokens`).Scan(&count)
	return count, err
}

// GetNotificationSettings loads user-configured notifications or returns defaults.
func (s *Storage) GetNotificationSettings() (*model.NotificationSettings, error) {
	val, err := s.GetSystemSetting("notification_settings")
	if err != nil {
		return nil, err
	}
	if val == "" {
		return &model.NotificationSettings{
			Telegram: model.TelegramConfig{Enabled: false},
			Webhook:  model.WebhookConfig{Enabled: false, Format: "generic"},
			Discord:  model.DiscordConfig{Enabled: false},
			Rules: model.NotificationRules{
				OfflineAlert:        true,
				OfflineThresholdSec: 60,
				RecoveryAlert:       true,
				TrafficAlert:        true,
				TrafficThresholdPct: 85,
				DailyReport:         false,
				DailyReportTime:     "09:00",
			},
			UpdatedAt: time.Now().Unix(),
		}, nil
	}
	var settings model.NotificationSettings
	if err := json.Unmarshal([]byte(val), &settings); err != nil {
		return nil, err
	}
	// Fallback sensible defaults if zero values
	if settings.Rules.OfflineThresholdSec <= 0 {
		settings.Rules.OfflineThresholdSec = 60
	}
	if settings.Rules.TrafficThresholdPct <= 0 {
		settings.Rules.TrafficThresholdPct = 85
	}
	if settings.Rules.DailyReportTime == "" {
		settings.Rules.DailyReportTime = "09:00"
	}
	if settings.Webhook.Format == "" {
		settings.Webhook.Format = "generic"
	}
	return &settings, nil
}

// SaveNotificationSettings writes user notification settings to storage.
func (s *Storage) SaveNotificationSettings(settings *model.NotificationSettings) error {
	settings.UpdatedAt = time.Now().Unix()
	bytes, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	return s.SetSystemSetting("notification_settings", string(bytes))
}

// AddNotificationLog logs a dispatched notification.
func (s *Storage) AddNotificationLog(item *model.NotificationLog) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().Unix()
	if item.Timestamp == 0 {
		item.Timestamp = now
	}

	res, err := s.db.Exec(`INSERT INTO notification_logs (timestamp, channel, type, title, content, status, error_msg)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		item.Timestamp, item.Channel, item.Type, item.Title, item.Content, item.Status, item.ErrorMsg)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	item.ID = id
	return nil
}

// CountNotificationLogs returns how many alert logs are stored. Paired with
// GetNotificationLogs so the UI can show a real total rather than just the size
// of the page it happens to be holding.
func (s *Storage) CountNotificationLogs() (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM notification_logs`).Scan(&count)
	return count, err
}

// GetNotificationLogs retrieves one page of alert logs, newest first.
//
// The ordering pairs timestamp with id: timestamps are second-granular, so a
// burst of alerts written in the same second would otherwise have no stable
// order between them, and rows could repeat or vanish across pages.
func (s *Storage) GetNotificationLogs(limit, offset int) ([]*model.NotificationLog, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	rows, err := s.db.Query(`SELECT id, timestamp, channel, type, title, content, status, COALESCE(error_msg, '')
		FROM notification_logs ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []*model.NotificationLog
	for rows.Next() {
		var item model.NotificationLog
		if err := rows.Scan(&item.ID, &item.Timestamp, &item.Channel, &item.Type, &item.Title, &item.Content, &item.Status, &item.ErrorMsg); err != nil {
			continue
		}
		logs = append(logs, &item)
	}
	return logs, nil
}

// ClearNotificationLogs wipes all notification history.
func (s *Storage) ClearNotificationLogs() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM notification_logs`)
	return err
}

// Close closes the SQLite database connection.
func (s *Storage) Close() error {
	return s.db.Close()
}
