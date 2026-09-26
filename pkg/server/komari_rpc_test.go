package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"probe/pkg/model"

	"github.com/gin-gonic/gin"
)

func setupTestServerForRPC(t *testing.T) (*Server, func()) {
	t.Helper()
	dbPath := t.TempDir() + "/test_rpc.db"
	storage, err := NewStorage(dbPath)
	if err != nil {
		t.Fatalf("NewStorage failed: %v", err)
	}

	downsampler := NewDownsampler(storage, 15*time.Second, 7)
	hub := NewHub(storage, downsampler)
	auth, err := NewAuthManager(storage, 24*time.Hour)
	if err != nil {
		t.Fatalf("NewAuthManager failed: %v", err)
	}

	srv := NewServer(hub, storage, downsampler, nil, nil, auth, false)

	// Seed a test node
	hub.IngestReport(&model.NodeReport{
		NodeID:    "test-node-1",
		Name:      "Tokyo-Edge-01",
		Region:    "JP",
		Tags:      []string{"Tokyo", "Edge"},
		Timestamp: time.Now().Unix(),
		System: model.SystemInfo{
			OS:         "Linux",
			Kernel:     "6.1.0",
			CPUModel:   "AMD EPYC",
			CPUCount:   4,
			MemTotal:   8 * 1024 * 1024 * 1024,
			MemUsed:    2 * 1024 * 1024 * 1024,
			DiskTotal:  100 * 1024 * 1024 * 1024,
			DiskUsed:   30 * 1024 * 1024 * 1024,
			Uptime:     3600,
			PublicIP:   "192.0.2.1",
			PublicIPv6: "2001:db8::1",
			CPUPercent: 25.5,
			Load1:      0.75,
		},
		Network: model.NetworkInfo{
			BytesSent:      1000000,
			BytesRecv:      2000000,
			TCPEstablished: 42,
		},
	}, "192.0.2.1")

	cleanup := func() {
		storage.Close()
	}
	return srv, cleanup
}

func TestKomariRPC2Endpoints(t *testing.T) {
	srv, cleanup := setupTestServerForRPC(t)
	defer cleanup()

	// 1. Test GET /api/rpc2
	{
		req := httptest.NewRequest("GET", "/api/rpc2", nil)
		w := httptest.NewRecorder()
		srv.router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("GET /api/rpc2 expected 200, got %d", w.Code)
		}
	}

	// 2. Test POST /api/rpc2: common:getNodes
	{
		payload := `{"jsonrpc":"2.0","method":"common:getNodes","id":1}`
		req := httptest.NewRequest("POST", "/api/rpc2", bytes.NewBufferString(payload))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("POST /api/rpc2 (common:getNodes) expected 200, got %d", w.Code)
		}

		var resp JSONRPCResponse
		if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if resp.Error != nil {
			t.Fatalf("unexpected RPC error: %v", resp.Error)
		}

		nodesRaw, err := json.Marshal(resp.Result)
		if err != nil {
			t.Fatalf("failed to marshal result: %v", err)
		}
		var nodes map[string]KomariRpcNode
		if err := json.Unmarshal(nodesRaw, &nodes); err != nil {
			t.Fatalf("failed to unmarshal nodes: %v", err)
		}
		if len(nodes) != 1 {
			t.Fatalf("expected 1 node, got %d", len(nodes))
		}
		n1, ok := nodes["test-node-1"]
		if !ok || n1.Name != "Tokyo-Edge-01" {
			t.Fatalf("node mismatch: %+v", n1)
		}
		if n1.IPv4 != "192.0.2.1" || n1.IPv6 != "2001:db8::1" {
			t.Fatalf("IP mismatch: %+v", n1)
		}
	}

	// 3. Test POST /api/rpc2: common:getNodesLatestStatus
	{
		payload := `{"jsonrpc":"2.0","method":"common:getNodesLatestStatus","id":2}`
		req := httptest.NewRequest("POST", "/api/rpc2", bytes.NewBufferString(payload))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("POST /api/rpc2 (common:getNodesLatestStatus) expected 200, got %d", w.Code)
		}

		var resp JSONRPCResponse
		if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if resp.Error != nil {
			t.Fatalf("unexpected RPC error: %v", resp.Error)
		}

		statusMapRaw, err := json.Marshal(resp.Result)
		if err != nil {
			t.Fatalf("failed to marshal result: %v", err)
		}
		var statusMap map[string]KomariRpcNodeStatus
		if err := json.Unmarshal(statusMapRaw, &statusMap); err != nil {
			t.Fatalf("failed to unmarshal status map: %v", err)
		}
		st, ok := statusMap["test-node-1"]
		if !ok {
			t.Fatalf("expected test-node-1 in status map")
		}
		if !st.Online || st.Client != "test-node-1" {
			t.Fatalf("status mismatch: %+v", st)
		}
		if st.CPU != 25.5 || st.Connections != 42 {
			t.Fatalf("metrics mismatch: %+v", st)
		}
	}

	// 4. Test POST /api/rpc2: Batch Request
	{
		payload := `[
			{"jsonrpc":"2.0","method":"common:getVersion","id":10},
			{"jsonrpc":"2.0","method":"rpc.ping","id":11}
		]`
		req := httptest.NewRequest("POST", "/api/rpc2", bytes.NewBufferString(payload))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("POST /api/rpc2 batch expected 200, got %d", w.Code)
		}

		var responses []JSONRPCResponse
		if err := json.NewDecoder(w.Body).Decode(&responses); err != nil {
			t.Fatalf("failed to decode batch response: %v", err)
		}
		if len(responses) != 2 {
			t.Fatalf("expected 2 responses, got %d", len(responses))
		}
		if responses[1].Result != "pong" {
			t.Fatalf("expected pong, got %v", responses[1].Result)
		}
	}

	// 5. Test GET /api/admin/client/list
	{
		req := httptest.NewRequest("GET", "/api/admin/client/list", nil)
		w := httptest.NewRecorder()
		srv.router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("GET /api/admin/client/list expected 200, got %d", w.Code)
		}
	}

	// 6. Test GET /api/admin/database/size
	{
		req := httptest.NewRequest("GET", "/api/admin/database/size", nil)
		w := httptest.NewRecorder()
		srv.router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("GET /api/admin/database/size expected 200, got %d", w.Code)
		}
	}
}

// TestKomariQueryMetricsPingSeries covers public:queryMetrics for the ping
// metrics modern themes chart: one latency and one loss series per ping task,
// each tagged with the task id, points bucketed from the downsampler history.
func TestKomariQueryMetricsPingSeries(t *testing.T) {
	srv, cleanup := setupTestServerForRPC(t)
	defer cleanup()

	target := &model.PingTargetConfig{Label: "中国电信", Target: "163.com", Protocol: "icmp", Interval: 60, Enabled: true}
	if err := srv.storage.AddPingTarget(target); err != nil {
		t.Fatal(err)
	}
	if target.ID == 0 {
		t.Fatal("ping target id not assigned")
	}

	now := time.Now().Unix()
	points := []*model.PingHistoryPoint{
		{NodeID: "test-node-1", Timestamp: now - 120, Target: "163.com", Label: "中国电信", LatencyMs: 40, PacketLoss: 0},
		{NodeID: "test-node-1", Timestamp: now - 60, Target: "163.com", Label: "中国电信", LatencyMs: 50, PacketLoss: 50},
	}
	if err := srv.storage.InsertPingBatch(points); err != nil {
		t.Fatal(err)
	}

	res, rpcErr := srv.executeRPCMethod("public:queryMetrics", map[string]interface{}{
		"metric_keys": []interface{}{"ping.latency_ms", "ping.loss"},
		"entity_id":   "test-node-1",
		"hours":       1,
		"max_points":  500,
	})
	if rpcErr != nil {
		t.Fatalf("rpc error: %v", rpcErr)
	}
	series, ok := res.(gin.H)["series"].([]KomariMetricSeries)
	if !ok || len(series) != 2 {
		t.Fatalf("expected 2 series, got %+v", res)
	}
	byKey := map[string]KomariMetricSeries{}
	for _, s := range series {
		if s.EntityID != "test-node-1" {
			t.Fatalf("series entity = %q", s.EntityID)
		}
		if id, _ := s.Tags["task_id"].(int64); id != target.ID {
			t.Fatalf("series %s task tag = %v, want %d", s.MetricKey, s.Tags["task_id"], target.ID)
		}
		byKey[s.MetricKey] = s
	}
	lat, ok := byKey["ping.latency_ms"]
	if !ok || len(lat.Points) == 0 {
		t.Fatal("missing latency points")
	}
	// The two samples land in separate buckets; both original values survive.
	if len(lat.Points) != 2 {
		t.Fatalf("latency points = %+v", lat.Points)
	}
	if lat.Points[0].Value != 40 || lat.Points[1].Value != 50 {
		t.Fatalf("latency values = %v/%v, want 40/50", lat.Points[0].Value, lat.Points[1].Value)
	}
	loss, ok := byKey["ping.loss"]
	if !ok || len(loss.Points) != 2 {
		t.Fatalf("loss points = %+v", loss.Points)
	}
	if loss.Points[0].Value != 0 || loss.Points[1].Value != 50 {
		t.Fatalf("loss values = %v/%v, want 0/50", loss.Points[0].Value, loss.Points[1].Value)
	}
}

// TestKomariQueryMetricsLoadSeries covers the load metric keys the dashboard
// charts request (cpu.usage, net rates) built from downsampler history.
func TestKomariQueryMetricsLoadSeries(t *testing.T) {
	srv, cleanup := setupTestServerForRPC(t)
	defer cleanup()

	now := time.Now().Unix()
	if err := srv.storage.InsertHistoryBatch([]*model.HistoryPoint{
		{NodeID: "test-node-1", Timestamp: now - 60, CPUPercent: 20, RateDownload: 1024, RateUpload: 512},
		{NodeID: "test-node-1", Timestamp: now - 30, CPUPercent: 60, RateDownload: 3072, RateUpload: 1536},
	}); err != nil {
		t.Fatal(err)
	}

	res, rpcErr := srv.executeRPCMethod("public:queryMetrics", map[string]interface{}{
		"metric_keys": []interface{}{"cpu.usage", "net.in.rate", "net.total.up"},
		"entity_id":   "test-node-1",
		"hours":       1,
	})
	if rpcErr != nil {
		t.Fatalf("rpc error: %v", rpcErr)
	}
	series, ok := res.(gin.H)["series"].([]KomariMetricSeries)
	if !ok || len(series) != 2 {
		t.Fatalf("expected 2 series (net.total.* has no history source), got %+v", res)
	}
	byKey := map[string]KomariMetricSeries{}
	for _, s := range series {
		byKey[s.MetricKey] = s
	}
	cpu, ok := byKey["cpu.usage"]
	if !ok || cpu.Points[0].Value != 20 || cpu.Points[1].Value != 60 || cpu.Unit != "%" {
		t.Fatalf("cpu series = %+v", byKey["cpu.usage"])
	}
	net, ok := byKey["net.in.rate"]
	if !ok || net.Points[0].Value != 1024 || net.Points[1].Value != 3072 {
		t.Fatalf("net series = %+v", byKey["net.in.rate"])
	}
}

// TestKomariPingMetricStats covers public:getPingMetricStats: per-task loss
// percentage and latency aggregates, which drive the 丢包/延迟 summary and the
// volatility badge in the themes.
func TestKomariPingMetricStats(t *testing.T) {
	srv, cleanup := setupTestServerForRPC(t)
	defer cleanup()

	target := &model.PingTargetConfig{Label: "Cloudflare", Target: "1.1.1.1", Protocol: "icmp", Interval: 60, Enabled: true}
	if err := srv.storage.AddPingTarget(target); err != nil {
		t.Fatal(err)
	}

	now := time.Now().Unix()
	points := []*model.PingHistoryPoint{
		{NodeID: "test-node-1", Timestamp: now - 90, Target: "1.1.1.1", Label: "Cloudflare", LatencyMs: 10, PacketLoss: 0},
		{NodeID: "test-node-1", Timestamp: now - 60, Target: "1.1.1.1", Label: "Cloudflare", LatencyMs: 20, PacketLoss: 0},
		{NodeID: "test-node-1", Timestamp: now - 30, Target: "1.1.1.1", Label: "Cloudflare", LatencyMs: 60, PacketLoss: 100},
	}
	if err := srv.storage.InsertPingBatch(points); err != nil {
		t.Fatal(err)
	}

	res, rpcErr := srv.executeRPCMethod("public:getPingMetricStats", map[string]interface{}{
		"uuid":  "test-node-1",
		"hours": 1,
	})
	if rpcErr != nil {
		t.Fatalf("rpc error: %v", rpcErr)
	}
	stats, ok := res.(gin.H)["stats"].([]KomariPingMetricStat)
	if !ok || len(stats) != 1 {
		t.Fatalf("expected 1 stat, got %+v", res)
	}
	st := stats[0]
	if st.TaskID != target.ID || st.EntityID != "test-node-1" || st.Name != "Cloudflare" {
		t.Fatalf("stat identity = %+v", st)
	}
	if st.Total != 3 {
		t.Fatalf("total = %d", st.Total)
	}
	// (0 + 0 + 100) / 3 = 33.3%
	if st.Loss < 33 || st.Loss > 34 {
		t.Fatalf("loss = %v, want ~33.3", st.Loss)
	}
	if st.Min != 10 || st.Max != 60 || st.Latest != 60 {
		t.Fatalf("min/max/latest = %v/%v/%v", st.Min, st.Max, st.Latest)
	}
	if st.P50 != 20 || st.P99 != 60 || st.P99P50Ratio != 3 {
		t.Fatalf("p50/p99/ratio = %v/%v/%v", st.P50, st.P99, st.P99P50Ratio)
	}
}

// TestKomariRecentEndpoint covers GET /api/recent/{uuid}: the record shape
// Komari themes parse for the instance-page monitor charts.
func TestKomariRecentEndpoint(t *testing.T) {
	srv, cleanup := setupTestServerForRPC(t)
	defer cleanup()

	now := time.Now().Unix()
	if err := srv.storage.InsertHistoryBatch([]*model.HistoryPoint{
		{NodeID: "test-node-1", Timestamp: now - 60, CPUPercent: 25, MemUsed: 1024, MemTotal: 4096, RateUpload: 100, RateDownload: 200, TCPCount: 7},
	}); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/recent/test-node-1", nil)
	rec := httptest.NewRecorder()
	srv.router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}

	var body struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Data) != 1 {
		t.Fatalf("expected 1 record, got %d", len(body.Data))
	}
	rec0 := body.Data[0]
	if _, ok := rec0["updated_at"].(string); !ok || rec0["updated_at"].(string) == "" {
		t.Fatalf("updated_at missing: %+v", rec0)
	}
	cpu := rec0["cpu"].(map[string]interface{})
	if cpu["usage"].(float64) != 25 {
		t.Fatalf("cpu usage = %v", cpu["usage"])
	}
	ram := rec0["ram"].(map[string]interface{})
	if ram["used"].(float64) != 1024 || ram["total"].(float64) != 4096 {
		t.Fatalf("ram = %v", ram)
	}
}

// TestKomariGetRecordsPing covers common:getRecords type=ping, the endpoint
// themes like leonetlab poll for every client's ping history at once. Rows
// must carry the real task id — a hardcoded id merged all targets into one
// zig-zag series — and unknown targets are dropped rather than misattributed.
func TestKomariGetRecordsPing(t *testing.T) {
	srv, cleanup := setupTestServerForRPC(t)
	defer cleanup()

	target := &model.PingTargetConfig{Label: "Google", Target: "8.8.8.8", Protocol: "tcp", Interval: 60, Enabled: true}
	if err := srv.storage.AddPingTarget(target); err != nil {
		t.Fatal(err)
	}

	now := time.Now().Unix()
	if err := srv.storage.InsertPingBatch([]*model.PingHistoryPoint{
		{NodeID: "test-node-1", Timestamp: now - 60, Target: "8.8.8.8", Label: "Google", LatencyMs: 12, PacketLoss: 0},
		{NodeID: "test-node-1", Timestamp: now - 30, Target: "9.9.9.9", Label: "Unconfigured", LatencyMs: 99, PacketLoss: 0},
	}); err != nil {
		t.Fatal(err)
	}

	res, rpcErr := srv.executeRPCMethod("common:getRecords", map[string]interface{}{
		"type": "ping", "hours": 1, "maxCount": 4000,
	})
	if rpcErr != nil {
		t.Fatalf("rpc error: %v", rpcErr)
	}
	payload := res.(gin.H)
	rows, ok := payload["records"].([]komariPingRecordRow)
	if !ok || len(rows) != 1 {
		t.Fatalf("expected exactly 1 attributed record, got %+v", payload["records"])
	}
	r := rows[0]
	if r.Client != "test-node-1" || r.TaskID != target.ID || r.Value != 12 {
		t.Fatalf("record = %+v", r)
	}
	if _, err := time.Parse(time.RFC3339, r.Time); err != nil {
		t.Fatalf("time %q not RFC3339: %v", r.Time, err)
	}
	if _, ok := payload["tasks"].([]KomariPingTask); !ok {
		t.Fatalf("tasks missing from response: %+v", payload)
	}

	// A uuid filter restricts the rows to that client.
	res, _ = srv.executeRPCMethod("common:getRecords", map[string]interface{}{
		"type": "ping", "hours": 1, "uuid": "other-node",
	})
	if rows := res.(gin.H)["records"].([]komariPingRecordRow); len(rows) != 0 {
		t.Fatalf("uuid filter leaked rows: %+v", rows)
	}
}

// TestKomariRecordsPingRESTTaskID pins the REST /api/records/ping task ids:
// every row must resolve through the configured tasks, never a constant.
func TestKomariRecordsPingRESTTaskID(t *testing.T) {
	srv, cleanup := setupTestServerForRPC(t)
	defer cleanup()

	target := &model.PingTargetConfig{Label: "Cloudflare", Target: "1.1.1.1", Protocol: "icmp", Interval: 60, Enabled: true}
	if err := srv.storage.AddPingTarget(target); err != nil {
		t.Fatal(err)
	}
	now := time.Now().Unix()
	if err := srv.storage.InsertPingBatch([]*model.PingHistoryPoint{
		{NodeID: "test-node-1", Timestamp: now - 30, Target: "1.1.1.1", Label: "Cloudflare", LatencyMs: 8, PacketLoss: 0},
	}); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/records/ping?uuid=test-node-1&hours=1", nil)
	rec := httptest.NewRecorder()
	srv.router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body struct {
		Data struct {
			Records []struct {
				TaskID int64   `json:"task_id"`
				Value  float64 `json:"value"`
			} `json:"records"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Data.Records) != 1 || body.Data.Records[0].TaskID != target.ID || body.Data.Records[0].Value != 8 {
		t.Fatalf("records = %+v", body.Data.Records)
	}
}

// TestKomariLatestStatusTimeIsRFC3339 pins the time format of
// common:getNodesLatestStatus: an epoch-seconds number read as milliseconds
// rendered every node's 最后上报 as a January 1970 date.
func TestKomariLatestStatusTimeIsRFC3339(t *testing.T) {
	srv, cleanup := setupTestServerForRPC(t)
	defer cleanup()

	res, rpcErr := srv.executeRPCMethod("common:getNodesLatestStatus", nil)
	if rpcErr != nil {
		t.Fatalf("rpc error: %v", rpcErr)
	}
	statusMap := res.(map[string]KomariRpcNodeStatus)
	st, ok := statusMap["test-node-1"]
	if !ok {
		t.Fatalf("node missing: %+v", statusMap)
	}
	if _, err := time.Parse(time.RFC3339, st.Time); err != nil {
		t.Fatalf("time %q not RFC3339: %v", st.Time, err)
	}
}

// TestKomariBillingCycleDays pins the Probe-label → Komari cycle-day mapping.
// Komari themes match day ranges (27-32 → monthly, 360-370 → annual, ...) to
// derive 月均/日均支出 and remaining value; a hardcoded 0 made every finance
// panel render 不适用.
func TestKomariBillingCycleDays(t *testing.T) {
	cases := map[string]int{
		"month":      30,
		"quarter":    90,
		"half_year":  180,
		"year":       365,
		"two_year":   730,
		"three_year": 1095,
		"one_time":   -1,
		"once":       -1,
		"":           0,
		"whatever":   0,
	}
	for cycle, want := range cases {
		if got := komariBillingCycleDays(cycle); got != want {
			t.Errorf("komariBillingCycleDays(%q) = %d, want %d", cycle, got, want)
		}
	}
	// Every recognized period must land inside the theme's matching range.
	ranges := map[string][2]int{
		"month": {27, 32}, "quarter": {87, 95}, "half_year": {175, 185},
		"year": {360, 370}, "two_year": {720, 750}, "three_year": {1080, 1150},
	}
	for cycle, r := range ranges {
		if got := komariBillingCycleDays(cycle); got < r[0] || got > r[1] {
			t.Errorf("cycle %q → %d days escapes the theme's range %v", cycle, got, r)
		}
	}
}

// TestKomariCurrencyCode pins the operator-note → ISO code normalization the
// themes' exchange-rate tables require ($/¥ are not table keys).
func TestKomariCurrencyCode(t *testing.T) {
	cases := map[string]string{
		"": "USD", "$": "USD", "¥": "CNY", "￥": "CNY", "€": "EUR", "£": "GBP",
		"cny": "CNY", "USD": "USD", "HK$": "HKD", "AUD": "AUD",
	}
	for in, want := range cases {
		if got := komariCurrencyCode(in); got != want {
			t.Errorf("komariCurrencyCode(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestKomariNodesExposeBillingFields verifies /api/nodes carries the billing
// fields Komari themes need, with the cycle in days and the expiry as null
// when unset.
func TestKomariNodesExposeBillingFields(t *testing.T) {
	srv, cleanup := setupTestServerForRPC(t)
	defer cleanup()

	srv.storage.SaveNodeSettings(&model.NodeSettings{
		NodeID:         "test-node-1",
		Price:          20.17,
		Currency:       "¥",
		BillingCycle:   "year",
		ExpiryDate:     "2026-10-22",
		AutoRenewal:    true,
		BandwidthQuota: 2000,
	})
	srv.hub.ReloadSettings()
	srv.hub.IngestReport(&model.NodeReport{
		NodeID:  "test-node-1",
		Network: model.NetworkInfo{BytesSent: 100, BytesRecv: 200},
	}, "192.0.2.1")

	req := httptest.NewRequest(http.MethodGet, "/api/nodes", nil)
	rec := httptest.NewRecorder()
	srv.router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	var node map[string]interface{}
	for _, n := range body.Data {
		if n["uuid"] == "test-node-1" {
			node = n
		}
	}
	if node == nil {
		t.Fatal("node missing from /api/nodes")
	}
	if node["price"].(float64) != 20.17 {
		t.Fatalf("price = %v", node["price"])
	}
	if node["billing_cycle"].(float64) != 365 {
		t.Fatalf("billing_cycle = %v, want 365 (year)", node["billing_cycle"])
	}
	if node["currency"] != "CNY" {
		t.Fatalf("currency = %v, want CNY (¥ normalized)", node["currency"])
	}
	if node["expired_at"] != "2026-10-22" {
		t.Fatalf("expired_at = %v", node["expired_at"])
	}
	if node["traffic_limit"].(float64) != 2000 {
		t.Fatalf("traffic_limit = %v", node["traffic_limit"])
	}
}
