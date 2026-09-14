package server

import (
	"database/sql"
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
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS system_settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);
	`
	_, err := s.db.Exec(schema)
	if err != nil {
		return fmt.Errorf("failed to initialize schema: %w", err)
	}

	// Dynamic column migrations if table previously had fewer columns
	s.migrateTableColumns()

	// Insert default token if none exists
	var count int
	_ = s.db.QueryRow("SELECT COUNT(*) FROM tokens").Scan(&count)
	if count == 0 {
		defaultToken := "sk_default_secret_probe_token"
		_ = s.AddToken(defaultToken, "Default System Token")
		log.Printf("[Storage] Initialized default agent token: %s", defaultToken)
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
		"ALTER TABLE node_settings ADD COLUMN bandwidth_used INTEGER DEFAULT 0",
	}
	for _, sqlStmt := range cols {
		_, _ = s.db.Exec(sqlStmt)
	}
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
	INSERT INTO nodes (node_id, name, token, region, os, kernel, is_online, last_seen, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(node_id) DO UPDATE SET
		name = CASE WHEN excluded.name != '' THEN excluded.name ELSE nodes.name END,
		token = CASE WHEN excluded.token != '' THEN excluded.token ELSE nodes.token END,
		region = CASE WHEN excluded.region != '' THEN excluded.region ELSE nodes.region END,
		os = CASE WHEN excluded.os != '' THEN excluded.os ELSE nodes.os END,
		kernel = CASE WHEN excluded.kernel != '' THEN excluded.kernel ELSE nodes.kernel END,
		is_online = excluded.is_online,
		last_seen = excluded.last_seen;
	`
	_, err := s.db.Exec(query,
		meta.NodeID, meta.Name, meta.Token, meta.Region, meta.OS, meta.Kernel,
		onlineInt, meta.LastSeen, now,
	)
	return err
}

// GetAllNodes returns all registered nodes from database.
func (s *Storage) GetAllNodes() ([]*model.NodeMetadata, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(`SELECT node_id, name, token, region, os, kernel, is_online, last_seen, created_at FROM nodes`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []*model.NodeMetadata
	for rows.Next() {
		var n model.NodeMetadata
		var isOnline int
		if err := rows.Scan(&n.NodeID, &n.Name, &n.Token, &n.Region, &n.OS, &n.Kernel, &isOnline, &n.LastSeen, &n.CreatedAt); err != nil {
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

	rows, err := s.db.Query(`SELECT id, label, target, color, protocol, port, interval, servers, auto_start, enabled, created_at FROM ping_targets ORDER BY sort_order ASC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var targets []model.PingTargetConfig
	for rows.Next() {
		var t model.PingTargetConfig
		var enabledInt, autoStartInt int
		var serversJSON string
		if err := rows.Scan(&t.ID, &t.Label, &t.Target, &t.Color, &t.Protocol, &t.Port, &t.Interval, &serversJSON, &autoStartInt, &enabledInt, &t.CreatedAt); err != nil {
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
	now := time.Now().Unix()
	res, err := s.db.Exec(`INSERT INTO ping_targets (label, target, color, protocol, port, interval, servers, auto_start, enabled, sort_order, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM ping_targets), ?)`,
		t.Label, t.Target, t.Color, t.Protocol, t.Port, t.Interval, string(serversJSON), autoStartInt, enabledInt, now)
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
	_, err := s.db.Exec(`UPDATE ping_targets SET label = ?, target = ?, color = ?, protocol = ?, port = ?, interval = ?, servers = ?, auto_start = ?, enabled = ? WHERE id = ?`,
		t.Label, t.Target, t.Color, t.Protocol, t.Port, t.Interval, string(serversJSON), autoStartInt, enabledInt, t.ID)
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

	row := s.db.QueryRow(`SELECT node_id, name, region, tags, provider, public_ip, price, currency, billing_cycle, expiry_date, bandwidth_quota, bandwidth_used, auto_renewal, updated_at
		FROM node_settings WHERE node_id = ?`, nodeID)

	var ns model.NodeSettings
	var tagsJSON string
	var autoRenewInt int
	err := row.Scan(&ns.NodeID, &ns.Name, &ns.Region, &tagsJSON, &ns.Provider, &ns.PublicIP, &ns.Price, &ns.Currency, &ns.BillingCycle, &ns.ExpiryDate, &ns.BandwidthQuota, &ns.BandwidthUsed, &autoRenewInt, &ns.UpdatedAt)
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

	rows, err := s.db.Query(`SELECT node_id, name, region, tags, provider, public_ip, price, currency, billing_cycle, expiry_date, bandwidth_quota, bandwidth_used, auto_renewal, updated_at FROM node_settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make(map[string]*model.NodeSettings)
	for rows.Next() {
		var ns model.NodeSettings
		var tagsJSON string
		var autoRenewInt int
		if err := rows.Scan(&ns.NodeID, &ns.Name, &ns.Region, &tagsJSON, &ns.Provider, &ns.PublicIP, &ns.Price, &ns.Currency, &ns.BillingCycle, &ns.ExpiryDate, &ns.BandwidthQuota, &ns.BandwidthUsed, &autoRenewInt, &ns.UpdatedAt); err != nil {
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
		node_id, name, region, tags, provider, public_ip, price, currency, billing_cycle, expiry_date, bandwidth_quota, bandwidth_used, auto_renewal, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
		updated_at = excluded.updated_at`,
		ns.NodeID, ns.Name, ns.Region, string(tagsBytes), ns.Provider, ns.PublicIP, ns.Price, ns.Currency, ns.BillingCycle, ns.ExpiryDate, ns.BandwidthQuota, ns.BandwidthUsed, autoRenewInt, now)
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

// Close closes the SQLite database connection.
func (s *Storage) Close() error {
	return s.db.Close()
}
