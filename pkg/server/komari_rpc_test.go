package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"probe/pkg/model"
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
