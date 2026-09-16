package server

import (
	"database/sql"
	"path/filepath"
	"testing"

	"probe/pkg/model"
)

// legacyNodesDB writes a database whose nodes table predates agent_version, so
// the column has to arrive through migrateTableColumns rather than the CREATE
// TABLE statement. Every deployment that already exists is in this shape.
func legacyNodesDB(t *testing.T, path string) {
	t.Helper()

	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`
		CREATE TABLE nodes (
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
		INSERT INTO nodes (node_id, name, token, region, os, kernel, is_online, last_seen, created_at)
		VALUES ('legacy-1', 'Legacy', 'tok', 'HK', 'Debian', '6.1.0', 0, 111, 222);`)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
}

// TestAgentVersionColumnMigratesOnLegacyDatabase covers the upgrade path that
// matters in production: an existing database gains the column without losing
// rows, and a node that predates the field reads back as an empty version —
// which the dashboard renders as "unknown", not as a version.
func TestAgentVersionColumnMigratesOnLegacyDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	legacyNodesDB(t, path)

	storage, err := NewStorage(path)
	if err != nil {
		t.Fatalf("opening a pre-agent_version database failed: %v", err)
	}
	defer storage.Close()

	nodes, err := storage.GetAllNodes()
	if err != nil {
		t.Fatal(err)
	}
	if len(nodes) != 1 {
		t.Fatalf("want the legacy row to survive the migration, got %d rows", len(nodes))
	}
	legacy := nodes[0]
	if legacy.NodeID != "legacy-1" {
		t.Fatalf("legacy row was altered: %+v", legacy)
	}
	if legacy.AgentVersion != "" {
		t.Fatalf("a node that never reported a version should read back empty, got %q", legacy.AgentVersion)
	}

	// The column is not merely readable — it accepts writes.
	if err := storage.UpsertNode(&model.NodeMetadata{
		NodeID: "legacy-1", Name: "Legacy", Token: "tok",
		OS: "Debian", Kernel: "6.1.0", AgentVersion: "1.2.3",
	}); err != nil {
		t.Fatal(err)
	}
	nodes, err = storage.GetAllNodes()
	if err != nil {
		t.Fatal(err)
	}
	if got := nodes[0].AgentVersion; got != "1.2.3" {
		t.Fatalf("agent version did not persist, got %q", got)
	}
}

// TestUpsertNodeKeepsVersionWhenReportOmitsIt pins the empty-preserving
// semantics the column shares with name/token/region/os/kernel. A report from
// a build without a version stamp carries "", and that must not erase the
// version already on record — otherwise one unstamped run would blank the
// dashboard for that node until it was upgraded.
func TestUpsertNodeKeepsVersionWhenReportOmitsIt(t *testing.T) {
	storage, err := NewStorage(filepath.Join(t.TempDir(), "probe.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()

	base := &model.NodeMetadata{NodeID: "node-1", Name: "node-1", Token: "tok", Kernel: "6.1.0"}
	withVersion := *base
	withVersion.AgentVersion = "1.2.3"

	if err := storage.UpsertNode(&withVersion); err != nil {
		t.Fatal(err)
	}
	if err := storage.UpsertNode(base); err != nil {
		t.Fatal(err)
	}

	nodes, err := storage.GetAllNodes()
	if err != nil {
		t.Fatal(err)
	}
	if len(nodes) != 1 {
		t.Fatalf("want one node, got %d", len(nodes))
	}
	if got := nodes[0].AgentVersion; got != "1.2.3" {
		t.Fatalf("an empty version overwrote a known one, got %q", got)
	}
}

// TestNodeRoundTripPreservesEveryColumn catches the signature failure of adding
// a column: a placeholder count, argument order, or SELECT/Scan order that no
// longer line up. That mistake does not raise an error — it silently shifts
// values into the wrong fields, so a node's region becomes its os and its token
// becomes something else. Only a full-field comparison finds it.
func TestNodeRoundTripPreservesEveryColumn(t *testing.T) {
	storage, err := NewStorage(filepath.Join(t.TempDir(), "probe.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()

	want := &model.NodeMetadata{
		NodeID: "node-1", Name: "Tokyo Edge", Token: "sk_agent_abc", Region: "JP",
		OS: "Debian GNU/Linux 13", Kernel: "6.12.43", AgentVersion: "1.2.3",
		LastSeen: 1770000000, IsOnline: true,
	}
	if err := storage.UpsertNode(want); err != nil {
		t.Fatal(err)
	}

	nodes, err := storage.GetAllNodes()
	if err != nil {
		t.Fatal(err)
	}
	if len(nodes) != 1 {
		t.Fatalf("want one node, got %d", len(nodes))
	}
	got := nodes[0]

	if got.NodeID != want.NodeID || got.Name != want.Name || got.Token != want.Token ||
		got.Region != want.Region || got.OS != want.OS || got.Kernel != want.Kernel ||
		got.AgentVersion != want.AgentVersion || got.LastSeen != want.LastSeen ||
		got.IsOnline != want.IsOnline {
		t.Fatalf("column values shifted during round-trip:\n want %+v\n  got %+v", want, got)
	}
	if got.CreatedAt == 0 {
		t.Fatal("created_at should be set on insert")
	}
}

// TestMigrationIsIdempotent reopens the same file twice: the second pass runs
// every ALTER again, including the one that already succeeded. That has to stay
// harmless, which is the whole reason the migration slice swallows errors.
func TestMigrationIsIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "probe.db")

	for i := 0; i < 2; i++ {
		storage, err := NewStorage(path)
		if err != nil {
			t.Fatalf("open %d failed: %v", i+1, err)
		}
		found, err := storage.columnExists("nodes", "agent_version")
		if err != nil {
			t.Fatal(err)
		}
		if !found {
			t.Fatalf("agent_version missing after open %d", i+1)
		}
		storage.Close()
	}
}

// TestHubHydratesAgentVersionFromStorage guards the restart path. Without it a
// freshly started server shows every node's version as blank — indistinguishable
// from "old agent" — until each host happens to report again.
func TestHubHydratesAgentVersionFromStorage(t *testing.T) {
	path := filepath.Join(t.TempDir(), "probe.db")
	storage, err := NewStorage(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := storage.UpsertNode(&model.NodeMetadata{
		NodeID: "node-1", Name: "node-1", Token: "tok", AgentVersion: "9.9.9",
	}); err != nil {
		t.Fatal(err)
	}
	storage.Close()

	reopened, err := NewStorage(path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()

	h := NewHub(reopened, nil)
	state, ok := h.GetNodeState("node-1")
	if !ok {
		t.Fatal("node-1 missing after hydration")
	}
	if state.IsOnline {
		t.Fatal("a hydrated node must start offline until it reports")
	}
	if state.System.AgentVersion != "9.9.9" {
		t.Fatalf("agent version was not hydrated, got %q", state.System.AgentVersion)
	}
}
