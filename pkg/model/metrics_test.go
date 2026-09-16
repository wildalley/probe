package model

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestAgentVersionOmittedWhenEmpty pins the wire contract the dashboard's
// "unknown version" state depends on.
//
// A node running a pre-versioning agent sends no agent_version at all, and the
// UI reads that absence as "old agent" — a meaning it cannot get from an empty
// string, which is indistinguishable from a build that was simply left
// unstamped. Dropping `omitempty` would not fail any other test; it would just
// quietly turn every legacy node into an ambiguous blank.
func TestAgentVersionOmittedWhenEmpty(t *testing.T) {
	payload, err := json.Marshal(NodeState{NodeID: "node-1"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(payload), "agent_version") {
		t.Fatalf("an unset agent version must be absent from the payload, got %s", payload)
	}
	// The surrounding system object is always present, so the absence above is
	// the field's own doing rather than a missing parent.
	if !strings.Contains(string(payload), `"system"`) {
		t.Fatalf("expected the system object to still be emitted, got %s", payload)
	}

	payload, err = json.Marshal(NodeState{
		NodeID: "node-1",
		System: SystemInfo{AgentVersion: "1.2.3"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(payload), `"agent_version":"1.2.3"`) {
		t.Fatalf("a set agent version must be present, got %s", payload)
	}
}
