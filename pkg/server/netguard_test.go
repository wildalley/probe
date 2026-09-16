package server

import (
	"net"
	"testing"
)

func TestIsBlockedIP(t *testing.T) {
	blocked := []string{
		"127.0.0.1",        // loopback
		"::1",              // loopback v6
		"0.0.0.0",          // unspecified
		"::",               // unspecified v6
		"10.0.0.5",         // private
		"172.16.4.9",       // private
		"172.31.255.254",   // private, upper bound
		"192.168.1.1",      // private
		"169.254.169.254",  // cloud metadata
		"fe80::1",          // link-local v6
		"100.64.0.1",       // carrier-grade NAT
		"100.127.255.255",  // CGNAT upper bound
		"198.18.0.1",       // benchmarking
		"198.19.255.255",   // benchmarking upper bound
		"224.0.0.1",        // multicast
		"::ffff:127.0.0.1", // IPv4-mapped loopback
		"::ffff:10.0.0.1",  // IPv4-mapped private
	}
	for _, s := range blocked {
		ip := net.ParseIP(s)
		if ip == nil {
			t.Fatalf("test bug: %q is not a parseable IP", s)
		}
		if !isBlockedIP(ip) {
			t.Errorf("isBlockedIP(%q) = false, want true", s)
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
	}
	for _, s := range allowed {
		ip := net.ParseIP(s)
		if ip == nil {
			t.Fatalf("test bug: %q is not a parseable IP", s)
		}
		if isBlockedIP(ip) {
			t.Errorf("isBlockedIP(%q) = true, want false", s)
		}
	}

	if !isBlockedIP(nil) {
		t.Error("isBlockedIP(nil) = false, want true")
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
		"https://",
	}
	for _, raw := range bad {
		if err := validateOutboundURL(raw); err == nil {
			t.Errorf("validateOutboundURL(%q) = nil, want error", raw)
		}
	}

	good := []string{
		"https://hooks.slack.com/services/xxx",
		"http://example.com/webhook",
		"https://open.feishu.cn/open-apis/bot/v2/hook/abc",
	}
	for _, raw := range good {
		if err := validateOutboundURL(raw); err != nil {
			t.Errorf("validateOutboundURL(%q) = %v, want nil", raw, err)
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
		{"example.com:6379", 0},      // port not allowlisted
		{"example.com", 22},          // SSH not allowlisted
		{"https://example.com", 443}, // URL, not host:port
		{"example.com/path", 443},    // path
		{"", 443},                    // empty
		{"example.com:0", 0},         // invalid port
		{"example.com:99999", 0},     // out of range
		{"example.com:abc", 0},       // non-numeric port
	}
	for _, c := range bad {
		if addr, err := validateProbeTarget(c.target, c.port); err == nil {
			t.Errorf("validateProbeTarget(%q, %d) = %q, nil; want error", c.target, c.port, addr)
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
		addr, err := validateProbeTarget(c.target, c.port)
		if err != nil {
			t.Errorf("validateProbeTarget(%q, %d) = %v, want %q", c.target, c.port, err, c.want)
			continue
		}
		if addr != c.want {
			t.Errorf("validateProbeTarget(%q, %d) = %q, want %q", c.target, c.port, addr, c.want)
		}
	}
}

func TestGuardedControlRejectsInternal(t *testing.T) {
	if err := guardedControl("tcp4", "169.254.169.254:80", nil); err == nil {
		t.Error("guardedControl allowed cloud metadata address")
	}
	if err := guardedControl("tcp4", "127.0.0.1:6379", nil); err == nil {
		t.Error("guardedControl allowed loopback address")
	}
	if err := guardedControl("tcp4", "8.8.8.8:53", nil); err != nil {
		t.Errorf("guardedControl blocked a public address: %v", err)
	}
}
