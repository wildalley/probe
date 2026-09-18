package server

import (
	"math/big"
	"path/filepath"
	"testing"
	"time"

	"probe/pkg/model"
)

// newBillingTestHub builds a Hub with just enough wiring for billing/traffic
// paths: real storage (for the anchor UPDATE) and a fixed rate table.
func newBillingTestHub(t *testing.T) *Hub {
	t.Helper()
	storage, err := NewStorage(filepath.Join(t.TempDir(), "probe.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = storage.Close() })
	return &Hub{
		storage:        storage,
		downsampler:    NewDownsampler(storage, 0, 0),
		nodeStates:     make(map[string]*model.NodeState),
		nodeSettings:   make(map[string]*model.NodeSettings),
		clients:        make(map[*wsWriteQueue]struct{}),
		agentConns:     make(map[string]*wsWriteQueue),
		broadcastChan:  make(chan *model.WSEvent, 64),
		exchangeRates:  map[string]float64{"USD": 7.0},
		offlineTimeout: 6,
	}
}

func TestCalculateBillingRemainingValue(t *testing.T) {
	h := newBillingTestHub(t)
	rates := map[string]float64{"USD": 7.0}

	t.Run("no expiry yields zeros", func(t *testing.T) {
		b := &model.BillingInfo{Price: 10, Currency: "$", BillingCycle: "month"}
		h.calculateBilling(b, rates)
		if b.RemainingDays != 0 || b.RemainingValue != 0 || b.RemainingValueNative != 0 {
			t.Fatalf("expected all-zero with no expiry, got days=%d value=%v native=%v",
				b.RemainingDays, b.RemainingValue, b.RemainingValueNative)
		}
	})

	t.Run("with expiry: CNY total and native both set", func(t *testing.T) {
		// A month cycle priced $30, expiring in ~10 days, is ~$10 native / ~¥70 CNY.
		expiry := time.Now().Add(10 * 24 * time.Hour).Format("2006-01-02")
		b := &model.BillingInfo{Price: 30, Currency: "$", BillingCycle: "month", ExpiryDate: expiry}
		h.calculateBilling(b, rates)
		if b.RemainingDays <= 0 {
			t.Fatalf("expected positive remaining days, got %d", b.RemainingDays)
		}
		if b.RemainingValueNative <= 0 {
			t.Fatalf("expected positive native value, got %v", b.RemainingValueNative)
		}
		// CNY figure must be the native amount times the USD rate.
		want := b.RemainingValueNative * 7.0
		if diff := b.RemainingValue - want; diff > 0.02 || diff < -0.02 {
			t.Fatalf("CNY value %v not native %v * rate 7.0 (=%v)", b.RemainingValue, b.RemainingValueNative, want)
		}
	})
}

func TestBandwidthAccumulationModel(t *testing.T) {
	h := newBillingTestHub(t)
	const nodeID = "node-bw"

	// Calibration baseline 1000, anchored at counter reading 5000.
	h.nodeSettings[nodeID] = &model.NodeSettings{
		NodeID:               nodeID,
		BandwidthUsed:        1000,
		BandwidthBaseCounter: 5000,
	}
	// The row must exist for the lazy re-anchor UPDATE to land somewhere.
	if err := h.storage.SaveNodeSettings(h.nodeSettings[nodeID]); err != nil {
		t.Fatal(err)
	}

	report := func(sent, recv uint64) *model.NodeState {
		r := &model.NodeReport{
			NodeID:  nodeID,
			Network: model.NetworkInfo{BytesSent: sent, BytesRecv: recv},
		}
		h.IngestReport(r, "203.0.113.9")
		h.mu.RLock()
		defer h.mu.RUnlock()
		return h.nodeStates[nodeID]
	}

	// live 5200 = anchor 5000 + 200 → effective 1000 + 200 = 1200.
	if st := report(5000, 200); st.Billing.BandwidthUsed != 1200 {
		t.Fatalf("expected 1200 on normal growth, got %d", st.Billing.BandwidthUsed)
	}

	// Counter reset (reboot / NIC rebuild): live 10 < anchor → re-anchor to 10,
	// baseline preserved → effective 1000.
	if st := report(10, 0); st.Billing.BandwidthUsed != 1000 {
		t.Fatalf("expected 1000 after counter reset re-anchor, got %d", st.Billing.BandwidthUsed)
	}
	// The re-anchor must have persisted, both in memory and in storage.
	if h.nodeSettings[nodeID].BandwidthBaseCounter != 10 {
		t.Fatalf("in-memory anchor not updated: %d", h.nodeSettings[nodeID].BandwidthBaseCounter)
	}
	if ns, _ := h.storage.GetNodeSettings(nodeID); ns == nil || ns.BandwidthBaseCounter != 10 {
		t.Fatalf("persisted anchor not updated: %+v", ns)
	}

	// Growth after the reset: live 100 = anchor 10 + 90 → effective 1000 + 90 = 1090.
	if st := report(100, 0); st.Billing.BandwidthUsed != 1090 {
		t.Fatalf("expected 1090 after post-reset growth, got %d", st.Billing.BandwidthUsed)
	}
}

func TestBandwidthNoCalibrationUsesLiveCounter(t *testing.T) {
	h := newBillingTestHub(t)
	const nodeID = "node-live"

	r := &model.NodeReport{
		NodeID:  nodeID,
		Network: model.NetworkInfo{BytesSent: 300, BytesRecv: 400},
	}
	h.IngestReport(r, "203.0.113.10")

	h.mu.RLock()
	st := h.nodeStates[nodeID]
	h.mu.RUnlock()
	if st.Billing.BandwidthUsed != 700 {
		t.Fatalf("expected raw live counter 700 with no calibration, got %d", st.Billing.BandwidthUsed)
	}
	if st.Billing.BandwidthLive != 700 {
		t.Fatalf("expected bandwidth_live 700, got %d", st.Billing.BandwidthLive)
	}
}

// TestLegacyAgentDemoPayloadIsDiscarded covers the version-skew case: an agent
// built before the hardcoded demo billing was removed keeps sending $9.9 / 27
// 天 / 2TB / a fake provider and tag triple, and stamps the same "中端服务器级"
// on every host. None of those fields has ever been settable on the agent side,
// so the server drops them wholesale rather than matching the specific strings
// that build happened to use — a node on an old agent shows unconfigured, which
// is the truth.
func TestLegacyAgentDemoPayloadIsDiscarded(t *testing.T) {
	h := newBillingTestHub(t)
	const nodeID = "node-legacy"

	h.IngestReport(&model.NodeReport{
		NodeID: nodeID,
		Tags:   []string{"电信CN2", "1Gbps", "CU4837"},
		Billing: model.BillingInfo{
			PricePerMonth:  9.9,
			Currency:       "$",
			RemainingDays:  27,
			RemainingValue: 59.84,
			BandwidthQuota: 2 * 1024 * 1024 * 1024 * 1024,
			Provider:       "Zillion Network Inc. · AS54801",
		},
		System: model.SystemInfo{CPUMark: "中端服务器级", CPUCount: 2},
	}, "203.0.113.11")

	h.mu.RLock()
	st := h.nodeStates[nodeID]
	h.mu.RUnlock()

	if len(st.Tags) != 0 {
		t.Fatalf("legacy demo tags leaked through: %v", st.Tags)
	}
	if st.Billing.Provider != "" {
		t.Fatalf("legacy demo provider leaked through: %q", st.Billing.Provider)
	}
	if st.Billing.Price != 0 || st.Billing.PricePerMonth != 0 {
		t.Fatalf("legacy demo price leaked through: price=%v per_month=%v", st.Billing.Price, st.Billing.PricePerMonth)
	}
	if st.Billing.BandwidthQuota != 0 {
		t.Fatalf("legacy demo quota leaked through: %d", st.Billing.BandwidthQuota)
	}
	if st.Billing.RemainingDays != 0 || st.Billing.RemainingValue != 0 {
		t.Fatalf("legacy demo expiry leaked through: days=%d value=%v", st.Billing.RemainingDays, st.Billing.RemainingValue)
	}
	if st.System.CPUMark != "" {
		t.Fatalf("legacy demo cpu_mark leaked through: %q", st.System.CPUMark)
	}
}

func TestPickPublicIPPrecedence(t *testing.T) {
	cases := []struct {
		name     string
		settings *model.NodeSettings
		reportV4 string
		reportV6 string
		clientIP string
		wantV4   string
		wantV6   string
	}{
		{
			name:     "operator override wins over agent and client",
			settings: &model.NodeSettings{PublicIP: "198.51.100.5"},
			reportV4: "203.0.113.7",
			clientIP: "203.0.113.99",
			wantV4:   "198.51.100.5",
		},
		{
			name:     "agent report beats client socket address",
			reportV4: "203.0.113.7",
			clientIP: "203.0.113.99",
			wantV4:   "203.0.113.7",
		},
		{
			name:     "private client address is dropped, not shown",
			clientIP: "172.20.1.0",
			wantV4:   "",
		},
		{
			name:     "client address used only as last resort",
			clientIP: "203.0.113.42",
			wantV4:   "203.0.113.42",
		},
		{
			name:     "ipv6 tracked separately",
			reportV4: "203.0.113.7",
			reportV6: "2606:4700::1111",
			wantV4:   "203.0.113.7",
			wantV6:   "2606:4700::1111",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			v4, v6 := pickPublicIP(tc.settings, tc.reportV4, tc.reportV6, tc.clientIP)
			if v4 != tc.wantV4 || v6 != tc.wantV6 {
				t.Fatalf("pickPublicIP = (%q, %q), want (%q, %q)", v4, v6, tc.wantV4, tc.wantV6)
			}
		})
	}
}

// TestBandwidthSplitSumsToTotal is the invariant that matters most: whatever the
// breakdown says, it has to add up to the number the quota is measured against.
// A ↑/↓ pair that disagreed with the total is exactly the class of bug this
// split could reintroduce, so it is checked across the awkward cases —
// no calibration, a fresh anchor, a counter reset, lopsided and zero traffic.
func TestBandwidthSplitSumsToTotal(t *testing.T) {
	cases := []struct {
		name                         string
		baseline, anchor, aUp, aDown uint64
		liveUp, liveDown             uint64
	}{
		{name: "no calibration", liveUp: 585, liveDown: 654},
		{name: "no calibration, nothing sent yet"},
		{name: "anchored mid-life", baseline: 1000, anchor: 300, aUp: 100, aDown: 200, liveUp: 150, liveDown: 400},
		{name: "unanchored baseline", baseline: 5000, liveUp: 585, liveDown: 654},
		{name: "counter reset below anchor", baseline: 5000, anchor: 9000, aUp: 4000, aDown: 5000, liveUp: 10, liveDown: 20},
		{name: "one direction reset only", baseline: 5000, anchor: 900, aUp: 400, aDown: 500, liveUp: 10, liveDown: 900},
		{name: "download only", baseline: 2048, anchor: 100, aDown: 100, liveDown: 900},
		{name: "upload only", baseline: 2048, anchor: 100, aUp: 100, liveUp: 900},
		{name: "legacy row: combined anchor, no split", baseline: 4096, anchor: 1000, liveUp: 700, liveDown: 900},
		{name: "baseline with zero counters", baseline: 777},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, _ := computeBandwidthUsage(tc.baseline, tc.anchor, tc.aUp, tc.aDown, tc.liveUp, tc.liveDown)
			if got.Up+got.Down != got.Total {
				t.Fatalf("breakdown does not sum to total: up=%d down=%d total=%d", got.Up, got.Down, got.Total)
			}
			if got.Live != tc.liveUp+tc.liveDown {
				t.Fatalf("live counter = %d, want %d", got.Live, tc.liveUp+tc.liveDown)
			}
			if got.Total < tc.baseline {
				t.Fatalf("total %d fell below the calibration baseline %d", got.Total, tc.baseline)
			}
		})
	}
}

// TestBandwidthSplitAttributesRealTraffic checks the split is actually
// meaningful, not just self-consistent: traffic counted after the anchor lands
// on the direction that carried it, and the baseline's own (unknowable) split
// follows the counter ratio at the anchor.
func TestBandwidthSplitAttributesRealTraffic(t *testing.T) {
	// Baseline 1000 anchored at 400↑/600↓ → baseline splits 40/60.
	// Since then: +300↑, +100↓.
	got, reanchored := computeBandwidthUsage(1000, 1000, 400, 600, 700, 700)
	if reanchored {
		t.Fatal("anchor moved even though both counters grew")
	}
	if got.Total != 1400 {
		t.Fatalf("total = %d, want 1400 (baseline 1000 + 400 new)", got.Total)
	}
	// 40% of 1000 = 400, plus the 300 actually uploaded.
	if got.Up != 700 {
		t.Fatalf("up = %d, want 700 (400 apportioned + 300 counted)", got.Up)
	}
	// 60% of 1000 = 600, plus the 100 actually downloaded.
	if got.Down != 700 {
		t.Fatalf("down = %d, want 700 (600 apportioned + 100 counted)", got.Down)
	}
}

// TestBandwidthNoCalibrationSplitIsExact covers the common case: with no
// calibration there is nothing to estimate, so the breakdown is the raw
// per-direction counters rather than an apportioned guess.
func TestBandwidthNoCalibrationSplitIsExact(t *testing.T) {
	got, reanchored := computeBandwidthUsage(0, 0, 0, 0, 585, 654)
	if reanchored {
		t.Fatal("no calibration should never need an anchor")
	}
	if got.Up != 585 || got.Down != 654 || got.Total != 1239 {
		t.Fatalf("got up=%d down=%d total=%d, want 585/654/1239", got.Up, got.Down, got.Total)
	}
}

// TestBandwidthDirectionalAnchorPersists verifies the per-direction anchors make
// it to storage. If only the combined anchor were saved, every restart would
// re-apportion the baseline from whatever ratio the counters happened to have,
// and the breakdown would visibly drift.
func TestBandwidthDirectionalAnchorPersists(t *testing.T) {
	h := newBillingTestHub(t)
	const nodeID = "node-split"

	h.nodeSettings[nodeID] = &model.NodeSettings{
		NodeID:        nodeID,
		BandwidthUsed: 1000,
	}
	if err := h.storage.SaveNodeSettings(h.nodeSettings[nodeID]); err != nil {
		t.Fatal(err)
	}

	// First report anchors lazily at 200↑/800↓.
	h.IngestReport(&model.NodeReport{
		NodeID:  nodeID,
		Network: model.NetworkInfo{BytesSent: 200, BytesRecv: 800},
	}, "203.0.113.11")

	ns, err := h.storage.GetNodeSettings(nodeID)
	if err != nil {
		t.Fatal(err)
	}
	if ns.BandwidthBaseCounter != 1000 || ns.BandwidthBaseCounterUp != 200 || ns.BandwidthBaseCounterDown != 800 {
		t.Fatalf("anchors not persisted per direction: combined=%d up=%d down=%d",
			ns.BandwidthBaseCounter, ns.BandwidthBaseCounterUp, ns.BandwidthBaseCounterDown)
	}

	// Second report: +100↑ only. The baseline splits 20/80 from the anchor.
	h.IngestReport(&model.NodeReport{
		NodeID:  nodeID,
		Network: model.NetworkInfo{BytesSent: 300, BytesRecv: 800},
	}, "203.0.113.11")

	h.mu.RLock()
	st := h.nodeStates[nodeID]
	h.mu.RUnlock()

	if st.Billing.BandwidthUsed != 1100 {
		t.Fatalf("total = %d, want 1100", st.Billing.BandwidthUsed)
	}
	if st.Billing.BandwidthUsedUp != 300 {
		t.Fatalf("up = %d, want 300 (200 apportioned + 100 counted)", st.Billing.BandwidthUsedUp)
	}
	if st.Billing.BandwidthUsedDown != 800 {
		t.Fatalf("down = %d, want 800 (800 apportioned + 0 counted)", st.Billing.BandwidthUsedDown)
	}
	if st.Billing.BandwidthUsedUp+st.Billing.BandwidthUsedDown != st.Billing.BandwidthUsed {
		t.Fatal("published breakdown does not sum to published total")
	}
}

// TestBandwidthUsageReportsAnchorsItUsed pins down the contract the caller relies
// on to persist a re-anchor. These fields were previously assigned in a deferred
// closure, which a non-pointer return copies before running — so every caller
// read zeros and had to guess the anchors instead.
func TestBandwidthUsageReportsAnchorsItUsed(t *testing.T) {
	// Legacy row: combined anchor 1000, no split. The recovery must keep the
	// original combined anchor and only fill in its halves.
	got, reanchored := computeBandwidthUsage(4096, 1000, 0, 0, 700, 900)
	if !reanchored {
		t.Fatal("a legacy row with no split must report a re-anchor")
	}
	if got.Anchor != 1000 {
		t.Fatalf("Anchor = %d, want the original 1000 kept (not advanced to live)", got.Anchor)
	}
	if got.AnchorUp+got.AnchorDown != got.Anchor {
		t.Fatalf("recovered split %d/%d does not sum to anchor %d",
			got.AnchorUp, got.AnchorDown, got.Anchor)
	}
	if got.AnchorUp > got.LiveUp || got.AnchorDown > got.LiveDown {
		t.Fatalf("recovered anchor %d/%d exceeds live counters %d/%d",
			got.AnchorUp, got.AnchorDown, got.LiveUp, got.LiveDown)
	}
}

// TestBandwidthLegacyRowKeepsAccumulatedTraffic is the data-loss case. A row
// written before the split existed has a combined anchor and zero halves. The
// recovery fills in the halves but must not move the combined anchor: advancing
// it to the live counter silently rebases the calibration to "now" and throws
// away every byte counted since the operator set it.
func TestBandwidthLegacyRowKeepsAccumulatedTraffic(t *testing.T) {
	h := newBillingTestHub(t)
	const nodeID = "node-legacy-anchor"

	// Baseline 1000 anchored at a combined 1000, with no directional split —
	// exactly what an upgraded database contains.
	h.nodeSettings[nodeID] = &model.NodeSettings{
		NodeID:               nodeID,
		BandwidthUsed:        1000,
		BandwidthBaseCounter: 1000,
	}
	if err := h.storage.SaveNodeSettings(h.nodeSettings[nodeID]); err != nil {
		t.Fatal(err)
	}

	// The node has since carried 600 more bytes (live 1600 vs anchor 1000), so
	// the effective total is 1000 + 600 = 1600.
	h.IngestReport(&model.NodeReport{
		NodeID:  nodeID,
		Network: model.NetworkInfo{BytesSent: 700, BytesRecv: 900},
	}, "203.0.113.12")

	h.mu.RLock()
	st := h.nodeStates[nodeID]
	h.mu.RUnlock()
	if st.Billing.BandwidthUsed != 1600 {
		t.Fatalf("total = %d, want 1600 (baseline 1000 + 600 counted since anchor)",
			st.Billing.BandwidthUsed)
	}

	// The persisted anchor must still be 1000. If it advanced to 1600, the next
	// report would compute 1000 + 0 and the 600 would be gone for good.
	ns, err := h.storage.GetNodeSettings(nodeID)
	if err != nil {
		t.Fatal(err)
	}
	if ns.BandwidthBaseCounter != 1000 {
		t.Fatalf("persisted anchor = %d, want 1000 kept; advancing it discards accumulated traffic",
			ns.BandwidthBaseCounter)
	}
	if ns.BandwidthBaseCounterUp+ns.BandwidthBaseCounterDown != ns.BandwidthBaseCounter {
		t.Fatalf("persisted split %d/%d does not sum to anchor %d",
			ns.BandwidthBaseCounterUp, ns.BandwidthBaseCounterDown, ns.BandwidthBaseCounter)
	}

	// A second identical report must reproduce the same total rather than drift.
	h.IngestReport(&model.NodeReport{
		NodeID:  nodeID,
		Network: model.NetworkInfo{BytesSent: 700, BytesRecv: 900},
	}, "203.0.113.12")

	h.mu.RLock()
	st = h.nodeStates[nodeID]
	h.mu.RUnlock()
	if st.Billing.BandwidthUsed != 1600 {
		t.Fatalf("total drifted to %d on an unchanged counter, want a stable 1600",
			st.Billing.BandwidthUsed)
	}
}

// TestBandwidthLivePublishesDirectionalCounters covers the raw NIC counters the
// calibration UI reads. bandwidth_live has always been published; its ↑/↓ halves
// were declared in the API model but never actually assigned, so the dashboard
// received zeros for both.
func TestBandwidthLivePublishesDirectionalCounters(t *testing.T) {
	h := newBillingTestHub(t)
	const nodeID = "node-live-split"

	h.IngestReport(&model.NodeReport{
		NodeID:  nodeID,
		Network: model.NetworkInfo{BytesSent: 300, BytesRecv: 400},
	}, "203.0.113.13")

	h.mu.RLock()
	st := h.nodeStates[nodeID]
	h.mu.RUnlock()

	if st.Billing.BandwidthLiveUp != 300 || st.Billing.BandwidthLiveDown != 400 {
		t.Fatalf("live split = %d↑/%d↓, want 300↑/400↓",
			st.Billing.BandwidthLiveUp, st.Billing.BandwidthLiveDown)
	}
	if st.Billing.BandwidthLiveUp+st.Billing.BandwidthLiveDown != st.Billing.BandwidthLive {
		t.Fatalf("live split does not sum to live total %d", st.Billing.BandwidthLive)
	}
}

// TestApportionIsExactAtPetabyteScale guards the integer split. Float64 carries
// 53 bits of mantissa and a petabyte is 2^50, so the old float path lost whole
// kilobytes on large baselines — and could round the first part past the total,
// which is what the callers' clamps were quietly absorbing.
func TestApportionIsExactAtPetabyteScale(t *testing.T) {
	const pb = uint64(1) << 50

	cases := []struct{ total, num, den uint64 }{
		{total: 8 * pb, num: 3 * pb, den: 8 * pb},
		{total: 7*pb + 12345, num: pb + 1, den: 3*pb + 7},
		{total: ^uint64(0) / 4, num: 1, den: 3},
		{total: 1000, num: 0, den: 1000},   // all to the second part
		{total: 1000, num: 1000, den: 1000}, // all to the first part
		{total: 0, num: 5, den: 10},
	}
	for _, tc := range cases {
		first, second := apportion(tc.total, tc.num, tc.den)
		if first+second != tc.total {
			t.Fatalf("apportion(%d,%d,%d) = %d+%d, does not sum to total",
				tc.total, tc.num, tc.den, first, second)
		}
		if first > tc.total {
			t.Fatalf("apportion(%d,%d,%d) first part %d exceeds total",
				tc.total, tc.num, tc.den, first)
		}
		// Exact floor of total*num/den, computed independently via big.Int.
		want := new(big.Int).Div(
			new(big.Int).Mul(new(big.Int).SetUint64(tc.total), new(big.Int).SetUint64(tc.num)),
			new(big.Int).SetUint64(tc.den),
		)
		if want.Uint64() != first {
			t.Fatalf("apportion(%d,%d,%d) = %d, want exact floor %s",
				tc.total, tc.num, tc.den, first, want)
		}
	}

	// A zero denominator carries no ratio, so the split is even and still exact.
	first, second := apportion(1001, 7, 0)
	if first+second != 1001 || first != 500 {
		t.Fatalf("zero-denominator split = %d/%d, want 500/501", first, second)
	}
}
