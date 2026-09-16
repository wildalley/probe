package netguard

import (
	"context"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestIsBlockedIP(t *testing.T) {
	blocked := []string{
		"127.0.0.1",          // loopback
		"::1",                // loopback v6
		"0.0.0.0",            // unspecified
		"::",                 // unspecified v6
		"10.0.0.5",           // private
		"172.16.4.9",         // private
		"172.31.255.254",     // private, upper bound
		"192.168.1.1",        // private
		"169.254.169.254",    // cloud metadata
		"fe80::1",            // link-local v6
		"100.64.0.1",         // carrier-grade NAT
		"100.127.255.255",    // CGNAT upper bound
		"198.18.0.1",         // benchmarking
		"198.19.255.255",     // benchmarking upper bound
		"224.0.0.1",          // multicast
		"::ffff:127.0.0.1",   // IPv4-mapped loopback
		"::ffff:10.0.0.1",    // IPv4-mapped private
		"64:ff9b::7f00:1",    // NAT64 of 127.0.0.1
		"64:ff9b::a9fe:a9fe", // NAT64 of 169.254.169.254
		"64:ff9b::a00:1",     // NAT64 of 10.0.0.1
		"64:ff9b:1::1",       // RFC 8215 local-use NAT64, refused wholesale
	}
	for _, s := range blocked {
		ip := net.ParseIP(s)
		if ip == nil {
			t.Fatalf("test bug: %q is not a parseable IP", s)
		}
		if !IsBlockedIP(ip) {
			t.Errorf("IsBlockedIP(%q) = false, want true", s)
		}
	}

	allowed := []string{
		"8.8.8.8",
		"1.1.1.1",
		"223.5.5.5",
		"172.32.0.1",     // just outside 172.16/12
		"172.15.255.255", // just below 172.16/12
		"100.63.255.255", // just below CGNAT
		"100.128.0.0",    // just above CGNAT
		"198.17.255.255", // just below benchmarking
		"198.20.0.0",     // just above benchmarking
		"2606:4700:4700::1111",
		"64:ff9b::808:808", // NAT64 of 8.8.8.8, a public address
	}
	for _, s := range allowed {
		ip := net.ParseIP(s)
		if ip == nil {
			t.Fatalf("test bug: %q is not a parseable IP", s)
		}
		if IsBlockedIP(ip) {
			t.Errorf("IsBlockedIP(%q) = true, want false", s)
		}
	}

	if !IsBlockedIP(nil) {
		t.Error("IsBlockedIP(nil) = false, want true")
	}
}

func TestValidateOutboundURL(t *testing.T) {
	bad := []string{
		"file:///etc/passwd",
		"gopher://example.com",
		"ftp://example.com",
		"http://127.0.0.1:6379",
		"http://169.254.169.254/latest/meta-data/",
		"https://10.0.0.1/hook",
		"http://[::1]:8080/x",
		"http://[64:ff9b::7f00:1]/x",
		"https://",
	}
	for _, raw := range bad {
		if err := ValidateOutboundURL(raw); err == nil {
			t.Errorf("ValidateOutboundURL(%q) = nil, want error", raw)
		}
	}

	good := []string{
		"https://hooks.slack.com/services/xxx",
		"http://example.com/webhook",
		"https://open.feishu.cn/open-apis/bot/v2/hook/abc",
	}
	for _, raw := range good {
		if err := ValidateOutboundURL(raw); err != nil {
			t.Errorf("ValidateOutboundURL(%q) = %v, want nil", raw, err)
		}
	}
}

func TestValidateProbeTarget(t *testing.T) {
	bad := []struct {
		target string
		port   int
	}{
		{"127.0.0.1", 443},           // loopback
		{"127.0.0.1:6379", 0},        // loopback + non-allowlisted port
		{"169.254.169.254", 80},      // metadata
		{"10.0.0.1:443", 0},          // private
		{"64:ff9b::7f00:1", 443},     // NAT64 loopback
		{"example.com:6379", 0},      // port not allowlisted
		{"example.com", 22},          // SSH not allowlisted
		{"https://example.com", 443}, // URL, not host:port
		{"example.com/path", 443},    // path
		{"", 443},                    // empty
		{"example.com:0", 0},         // invalid port
		{"example.com:99999", 0},     // out of range
		{"example.com:abc", 0},       // non-numeric port
		{"example.com", -1},          // negative port is not an absent port
	}
	for _, c := range bad {
		if addr, err := ValidateProbeTarget(c.target, c.port); err == nil {
			t.Errorf("ValidateProbeTarget(%q, %d) = %q, nil; want error", c.target, c.port, addr)
		}
	}

	good := []struct {
		target string
		port   int
		want   string
	}{
		{"8.8.8.8:53", 0, "8.8.8.8:53"},
		{"8.8.8.8", 53, "8.8.8.8:53"},
		{"example.com", 443, "example.com:443"},
		{"example.com:80", 0, "example.com:80"},
		{"api.openai.com:443", 0, "api.openai.com:443"},
		{"2606:4700:4700::1111", 443, "[2606:4700:4700::1111]:443"},
	}
	for _, c := range good {
		addr, err := ValidateProbeTarget(c.target, c.port)
		if err != nil {
			t.Errorf("ValidateProbeTarget(%q, %d) = %v, want %q", c.target, c.port, err, c.want)
			continue
		}
		if addr != c.want {
			t.Errorf("ValidateProbeTarget(%q, %d) = %q, want %q", c.target, c.port, addr, c.want)
		}
	}
}

// TestValidatePingTarget covers the saved-target path, including the HTTP
// protocol whose address the agent turns into a URL rather than a host:port.
func TestValidatePingTarget(t *testing.T) {
	bad := []struct {
		protocol string
		target   string
		port     int
	}{
		{"tcp", "127.0.0.1", 443},
		{"tcp", "192.168.1.1:443", 0},
		{"tcp", "example.com", 22},
		{"icmp", "169.254.169.254", 80},
		{"http", "127.0.0.1", 0},                     // becomes https://127.0.0.1
		{"http", "http://169.254.169.254/latest", 0}, // metadata over HTTP
		{"http", "http://example.com:6379/", 0},      // port not allowlisted
		{"http", "file:///etc/passwd", 0},
		{"HTTP", "10.0.0.1", 0}, // protocol match is case-insensitive
		{"tcp", "", 443},
	}
	for _, c := range bad {
		if err := ValidatePingTarget(c.protocol, c.target, c.port); err == nil {
			t.Errorf("ValidatePingTarget(%q, %q, %d) = nil, want error", c.protocol, c.target, c.port)
		}
	}

	good := []struct {
		protocol string
		target   string
		port     int
	}{
		{"tcp", "8.8.8.8", 53},
		{"tcp", "8.8.8.8:53", 0},
		{"tcp", "example.com", 443},
		{"icmp", "1.1.1.1", 443},
		{"http", "example.com", 0},
		{"http", "https://example.com/health", 0},
		{"http", "http://example.com:8080/health", 0},
	}
	for _, c := range good {
		if err := ValidatePingTarget(c.protocol, c.target, c.port); err != nil {
			t.Errorf("ValidatePingTarget(%q, %q, %d) = %v, want nil", c.protocol, c.target, c.port, err)
		}
	}
}

func TestGuardedControlRejectsInternal(t *testing.T) {
	if err := GuardedControl("tcp4", "169.254.169.254:80", nil); err == nil {
		t.Error("GuardedControl allowed cloud metadata address")
	}
	if err := GuardedControl("tcp4", "127.0.0.1:6379", nil); err == nil {
		t.Error("GuardedControl allowed loopback address")
	}
	if err := GuardedControl("tcp6", "[64:ff9b::7f00:1]:80", nil); err == nil {
		t.Error("GuardedControl allowed NAT64 loopback address")
	}
	if err := GuardedControl("tcp4", "8.8.8.8:53", nil); err != nil {
		t.Errorf("GuardedControl blocked a public address: %v", err)
	}
}

// TestAllowPrivateTargets checks the documented opt-out: with the variable set,
// a LAN target and an off-allowlist port both become acceptable.
func TestAllowPrivateTargets(t *testing.T) {
	t.Setenv(EnvAllowPrivateTargets, "1")

	if _, err := ValidateProbeTarget("192.168.1.10:9100", 0); err != nil {
		t.Errorf("ValidateProbeTarget with opt-out = %v, want nil", err)
	}
	if err := ValidatePingTarget("http", "http://192.168.1.10:9100/metrics", 0); err != nil {
		t.Errorf("ValidatePingTarget with opt-out = %v, want nil", err)
	}
	if err := ValidateOutboundURL("http://192.168.1.10:9100/hook"); err != nil {
		t.Errorf("ValidateOutboundURL with opt-out = %v, want nil", err)
	}
	if err := GuardedControl("tcp4", "127.0.0.1:6379", nil); err != nil {
		t.Errorf("GuardedControl with opt-out = %v, want nil", err)
	}
}

func TestGuardedProbeHTTPClientPorts(t *testing.T) {
	client := NewGuardedProbeHTTPClient(time.Second)
	transport := client.Transport.(*http.Transport)
	if _, err := transport.DialContext(context.Background(), "tcp", "8.8.8.8:22"); err == nil {
		t.Fatal("probe HTTP client allowed a non-probe port")
	}
	for _, raw := range []string{
		"http://8.8.8.8:22/",
		"http://127.0.0.1/",
		"http://[64:ff9b::7f00:1]/",
	} {
		req, err := http.NewRequest("HEAD", raw, nil)
		if err != nil {
			t.Fatal(err)
		}
		if err := client.CheckRedirect(req, []*http.Request{req}); err == nil {
			t.Errorf("probe HTTP client allowed redirect to %q", raw)
		}
	}
}
