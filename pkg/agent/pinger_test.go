package agent

import "testing"

func TestUpdateTargetsResetsChangedDestination(t *testing.T) {
	original := TargetConfig{ID: 7, Label: "edge", Address: "8.8.8.8:53", Protocol: "tcp"}
	p := NewPinger([]TargetConfig{original})
	p.stats[keyForTarget(original)].latencyMs = 12.5
	p.stats[keyForTarget(original)].jitter = 4
	p.stats[keyForTarget(original)].lostFilled = 1
	p.stats[keyForTarget(original)].lostInWindow = 1

	p.UpdateTargets([]TargetConfig{{ID: 7, Label: "edge", Address: "1.1.1.1:53", Protocol: "tcp"}})
	stats := p.GetStats()
	if len(stats) != 1 || stats[0].Target != "1.1.1.1:53" || stats[0].LatencyMs != 0 || stats[0].PacketLoss != 0 || stats[0].Jitter != 0 {
		t.Fatalf("changed destination kept old measurements: %+v", stats)
	}

	p.UpdateTargets(nil)
	if stats := p.GetStats(); len(stats) != 0 {
		t.Fatalf("empty sync kept old targets: %+v", stats)
	}
}

func TestSameLabelTargetsKeepIndependentStats(t *testing.T) {
	a := TargetConfig{ID: 10, Label: "edge", Address: "8.8.8.8:53", Protocol: "tcp"}
	b := TargetConfig{ID: 11, Label: "edge", Address: "1.1.1.1:53", Protocol: "tcp"}
	p := NewPinger([]TargetConfig{a, b})
	p.stats[keyForTarget(a)].latencyMs = 12
	p.stats[keyForTarget(b)].latencyMs = 40
	p.stats[keyForTarget(a)].lostFilled = 1
	p.stats[keyForTarget(a)].lostInWindow = 1

	stats := p.GetStats()
	if len(stats) != 2 || stats[0].LatencyMs != 12 || stats[1].LatencyMs != 40 || stats[0].PacketLoss != 100 || stats[1].PacketLoss != 0 {
		t.Fatalf("same-label targets shared measurements: %+v", stats)
	}
	if stats[0].Label == stats[1].Label {
		t.Fatalf("same-label targets are indistinguishable to clients: %+v", stats)
	}
}
