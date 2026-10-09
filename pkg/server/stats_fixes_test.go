package server

import (
	"testing"
	"time"

	"probe/pkg/model"
)

func TestClockOffset(t *testing.T) {
	now := int64(1_000_000)
	cases := []struct {
		agent, want int64
	}{
		{0, 0},        // no timestamp reported
		{now - 30, 0}, // normal drift kept exact
		{now + maxAgentClockSkew, 0},
		{now - 3600, 3600},    // agent an hour behind
		{now + 86400, -86400}, // agent a day ahead
	}
	for _, c := range cases {
		if got := clockOffset(c.agent, now); got != c.want {
			t.Errorf("clockOffset(%d) = %d, want %d", c.agent, got, c.want)
		}
	}
}

// A node whose clock is a day ahead must still land in "now" history, with
// probe spacing preserved and each probe stored once.
func TestDownsamplerRebasesSkewedAgentClock(t *testing.T) {
	storage, err := NewStorage(t.TempDir() + "/skew.db")
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	d := NewDownsampler(storage, time.Hour, 7)

	now := time.Now().Unix()
	agentNow := now + 86400
	p := model.PingStat{Target: "1.1.1.1", Label: "CF", LatencyMs: 10, ProbedAt: agentNow - 2}
	for i := 0; i < 3; i++ {
		d.RecordIngest(&model.NodeReport{NodeID: "n1", Timestamp: agentNow, Pings: []model.PingStat{p}})
	}
	d.flush()

	rows, err := storage.GetPingHistory("n1", now-60, now+60)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("want 1 ping row near server time, got %d", len(rows))
	}
	if d := rows[0].Timestamp - now; d < -5 || d > 1 {
		t.Fatalf("ping timestamp off by %ds from server clock", d)
	}
	hist, err := storage.GetHistory("n1", now-60, now+60)
	if err != nil {
		t.Fatal(err)
	}
	if len(hist) != 1 {
		t.Fatalf("want 1 history row near server time, got %d", len(hist))
	}
}

func TestBeginGeoLookup(t *testing.T) {
	key := "203.0.113.77"
	defer geoIPFailures.Delete(key)
	defer geoIPInflight.Delete(key)
	now := time.Now()

	if !beginGeoLookup(key, now) {
		t.Fatal("first lookup should start")
	}
	if beginGeoLookup(key, now) {
		t.Fatal("concurrent lookup for the same key must not start")
	}
	endGeoLookup(key)

	geoIPFailures.Store(key, now)
	if beginGeoLookup(key, now.Add(time.Minute)) {
		t.Fatal("recent failure must back off")
	}
	if !beginGeoLookup(key, now.Add(geoIPRetryAfter+time.Second)) {
		t.Fatal("failure must be retried after the backoff")
	}
	endGeoLookup(key)
}
