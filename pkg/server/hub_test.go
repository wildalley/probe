package server

import (
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"probe/pkg/model"
)

func TestOfflineTransitionKeepsPublishedStateImmutable(t *testing.T) {
	storage, err := NewStorage(filepath.Join(t.TempDir(), "probe.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()

	previous := &model.NodeState{
		NodeID: "node-1", Name: "node-1", IsOnline: true,
		LastSeen: time.Now().Add(-time.Minute).Unix(), RateDown: 100,
		Tags: []string{"old"},
	}
	h := &Hub{
		storage: storage, nodeStates: map[string]*model.NodeState{"node-1": previous},
		broadcastChan: make(chan *model.WSEvent, 1), offlineTimeout: 6,
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < 100; i++ {
			_, _ = json.Marshal(previous)
		}
	}()
	h.checkOfflineNodes()
	<-done

	if !previous.IsOnline || previous.RateDown != 100 {
		t.Fatalf("previously published state was mutated: %+v", previous)
	}
	state := h.nodeStates["node-1"]
	if state == previous || state.IsOnline || state.RateDown != 0 {
		t.Fatalf("offline state was not replaced: %+v", state)
	}
	event := <-h.broadcastChan
	if event.Data.(*model.NodeState) == state {
		t.Fatal("broadcast contains the live state pointer")
	}
}

func TestUnregisterAgentKeepsReplacement(t *testing.T) {
	old := &wsWriteQueue{}
	replacement := &wsWriteQueue{}
	h := &Hub{agentConns: map[string]*wsWriteQueue{"node-1": replacement}}
	h.UnregisterAgent("node-1", old)
	if h.agentConns["node-1"] != replacement {
		t.Fatal("old connection removed its replacement")
	}
	h.UnregisterAgent("node-1", replacement)
	if _, ok := h.agentConns["node-1"]; ok {
		t.Fatal("active connection was not removed")
	}
}

func TestPingTargetAssignmentsSurviveNewNodesAndRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "probe.db")
	storage, err := NewStorage(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := storage.UpsertNode(&model.NodeMetadata{NodeID: "existing", Name: "existing"}); err != nil {
		t.Fatal(err)
	}
	target := &model.PingTargetConfig{Label: "edge", Target: "8.8.8.8:53", Protocol: "tcp", Port: 53, Enabled: true}
	if err := storage.AddPingTarget(target); err != nil {
		t.Fatal(err)
	}
	if err := storage.UpsertNode(&model.NodeMetadata{NodeID: "new", Name: "new"}); err != nil {
		t.Fatal(err)
	}
	if err := storage.Close(); err != nil {
		t.Fatal(err)
	}
	storage, err = NewStorage(path)
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()

	targets, err := storage.GetPingTargets()
	if err != nil {
		t.Fatal(err)
	}
	var saved model.PingTargetConfig
	for _, candidate := range targets {
		if candidate.ID == target.ID {
			saved = candidate
			break
		}
	}
	if !targetAppliesToNode(saved, "existing") || targetAppliesToNode(saved, "new") {
		t.Fatalf("auto_start=false assignments changed after restart: %+v", saved)
	}
	for _, tc := range []struct {
		nodeID string
		want   bool
	}{{"existing", true}, {"new", false}} {
		payload, ok := pingTargetsPayload(tc.nodeID, targets)
		if !ok {
			t.Fatal("failed to build config payload")
		}
		var frame struct {
			Data struct {
				PingTargets []model.PingTargetConfig `json:"ping_targets"`
			} `json:"data"`
		}
		if err := json.Unmarshal(payload, &frame); err != nil {
			t.Fatal(err)
		}
		found := false
		for _, candidate := range frame.Data.PingTargets {
			if candidate.ID == target.ID {
				found = true
			}
		}
		if found != tc.want {
			t.Fatalf("target in %s config = %t, want %t", tc.nodeID, found, tc.want)
		}
	}
	saved.Servers = []string{"new"}
	if err := storage.UpdatePingTarget(&saved); err != nil {
		t.Fatal(err)
	}
	targets, err = storage.GetPingTargets()
	if err != nil {
		t.Fatal(err)
	}
	for _, candidate := range targets {
		if candidate.ID == target.ID {
			if targetAppliesToNode(candidate, "existing") || !targetAppliesToNode(candidate, "new") {
				t.Fatalf("explicit servers ignored: %+v", candidate)
			}
		}
	}
	saved.Servers = nil
	saved.AutoStart = true
	if err := storage.UpdatePingTarget(&saved); err != nil {
		t.Fatal(err)
	}
	saved.AutoStart = false
	if err := storage.UpdatePingTarget(&saved); err != nil {
		t.Fatal(err)
	}
	targets, err = storage.GetPingTargets()
	if err != nil {
		t.Fatal(err)
	}
	for _, candidate := range targets {
		if candidate.ID == target.ID && (!targetAppliesToNode(candidate, "existing") || !targetAppliesToNode(candidate, "new")) {
			t.Fatalf("turning off auto-start did not keep current nodes: %+v", candidate)
		}
	}
}

func TestDeleteNodeRequiresAgentToStop(t *testing.T) {
	storage, err := NewStorage(filepath.Join(t.TempDir(), "probe.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	if err := storage.UpsertNode(&model.NodeMetadata{NodeID: "node-1", Name: "node-1", IsOnline: true}); err != nil {
		t.Fatal(err)
	}
	h := &Hub{
		storage:       storage,
		nodeStates:    map[string]*model.NodeState{"node-1": {NodeID: "node-1", IsOnline: true}},
		agentConns:    map[string]*wsWriteQueue{},
		broadcastChan: make(chan *model.WSEvent, 1),
	}
	if err := h.DeleteNode("node-1"); err != ErrNodeActive {
		t.Fatalf("active node deletion = %v, want ErrNodeActive", err)
	}
	if _, ok := h.nodeStates["node-1"]; !ok {
		t.Fatal("active node was removed")
	}
	h.nodeStates["node-1"] = &model.NodeState{NodeID: "node-1"}
	h.agentConns["node-1"] = &wsWriteQueue{}
	if err := h.DeleteNode("node-1"); err != ErrNodeActive {
		t.Fatalf("connected node deletion = %v, want ErrNodeActive", err)
	}
	delete(h.agentConns, "node-1")
	if err := h.DeleteNode("node-1"); err != nil {
		t.Fatalf("stopped node deletion failed: %v", err)
	}
}

func TestBroadcastResyncSkipsOldEventsAndClosesOnOverflow(t *testing.T) {
	q := &wsWriteQueue{send: make(chan []byte, 2), closed: make(chan struct{}), minSequence: 2}
	h := &Hub{
		clients:       map[*wsWriteQueue]struct{}{q: {}},
		broadcastChan: make(chan *model.WSEvent, 1),
	}
	h.broadcastToClients(&model.WSEvent{Type: "node_update", Sequence: 1})
	if len(q.send) != 0 {
		t.Fatal("stale event was delivered after snapshot")
	}
	h.broadcastToClients(&model.WSEvent{Type: "node_update", Sequence: 3})
	if len(q.send) != 1 {
		t.Fatal("new event was not delivered")
	}
	h.sendBroadcast(&model.WSEvent{Type: "node_update"})
	h.sendBroadcast(&model.WSEvent{Type: "node_delete"})
	if !q.IsClosed() {
		t.Fatal("queue overflow did not force a fresh snapshot")
	}
}

func TestLegacyTargetAssignmentsAreMigrated(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE nodes (node_id TEXT PRIMARY KEY);
		INSERT INTO nodes (node_id) VALUES ('existing');
		CREATE TABLE ping_targets (
			id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, target TEXT NOT NULL,
			color TEXT NOT NULL, protocol TEXT DEFAULT 'tcp', port INTEGER DEFAULT 443,
			interval INTEGER DEFAULT 60, servers TEXT DEFAULT '', auto_start INTEGER DEFAULT 1,
			enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at INTEGER NOT NULL
		);
		INSERT INTO ping_targets (label, target, color, servers, auto_start, created_at)
		VALUES ('legacy', '8.8.8.8:53', '#000', '[]', 0, 1);`)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	storage, err := NewStorage(path)
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	targets, err := storage.GetPingTargets()
	if err != nil || len(targets) != 1 {
		t.Fatalf("migrated targets: %v, %+v", err, targets)
	}
	if !targetAppliesToNode(targets[0], "existing") || targetAppliesToNode(targets[0], "new") {
		t.Fatalf("legacy target assignment was not frozen: %+v", targets[0])
	}
}
