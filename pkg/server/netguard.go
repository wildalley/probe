package server

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// Outbound requests here are built from operator-supplied input: ping target
// addresses, webhook URLs, GeoIP lookups. All of them originate on the server,
// inside whatever network the dashboard is deployed in, so without a guard they
// let an authenticated operator reach hosts the internet cannot — cloud metadata
// endpoints (169.254.169.254), localhost services, the rest of the private
// subnet — and read back success/failure and timing. That turns the dashboard
// into an internal port scanner and a request forwarder.
//
// Operators who genuinely need a LAN destination (a self-hosted webhook
// receiver, for instance) can opt out with PROBE_ALLOW_PRIVATE_TARGETS=1.

var errBlockedTarget = errors.New("target address is not permitted")

// allowPrivateTargets reports whether the operator disabled the private-range
// guard. Read once per call rather than cached so it stays testable and honours
// an env change on restart without extra wiring.
func allowPrivateTargets() bool {
	v := strings.TrimSpace(os.Getenv("PROBE_ALLOW_PRIVATE_TARGETS"))
	return v == "1" || strings.EqualFold(v, "true") || strings.EqualFold(v, "yes")
}

// isBlockedIP reports whether an address belongs to a range that must not be
// reachable from operator-supplied input.
func isBlockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	// Unspecified (0.0.0.0, ::) routes to localhost on most stacks.
	if ip.IsUnspecified() {
		return true
	}
	if ip.IsLoopback() || ip.IsPrivate() {
		return true
	}
	// 169.254.0.0/16 and fe80::/10. Cloud metadata lives here.
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}
	if ip.IsMulticast() || ip.IsInterfaceLocalMulticast() {
		return true
	}
	// Carrier-grade NAT (100.64.0.0/10) and IPv4 benchmarking (198.18.0.0/15)
	// are not covered by IsPrivate but are equally internal in practice.
	if v4 := ip.To4(); v4 != nil {
		if v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127 {
			return true
		}
		if v4[0] == 198 && (v4[1] == 18 || v4[1] == 19) {
			return true
		}
	}
	// IPv4-mapped and NAT64 forms of an otherwise blocked address.
	if v4 := ip.To4(); v4 != nil && !ip.Equal(v4) {
		return isBlockedIP(v4)
	}
	return false
}

// guardedControl is the dialer hook that vets the concrete address the socket is
// about to connect to. Checking here rather than before resolution is what makes
// DNS rebinding ineffective: the name may resolve differently between the check
// and the connect, but this sees the address the syscall actually uses.
func guardedControl(_ string, address string, _ syscall.RawConn) error {
	if allowPrivateTargets() {
		return nil
	}
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return errBlockedTarget
	}
	if isBlockedIP(net.ParseIP(host)) {
		return errBlockedTarget
	}
	return nil
}

// guardedDialer dials only addresses that pass the range check.
func guardedDialer(timeout time.Duration) *net.Dialer {
	return &net.Dialer{
		Timeout: timeout,
		Control: guardedControl,
	}
}

// dialGuarded connects to addr, refusing internal address ranges.
func dialGuarded(ctx context.Context, addr string, timeout time.Duration) (net.Conn, error) {
	return guardedDialer(timeout).DialContext(ctx, "tcp", addr)
}

// newGuardedHTTPClient builds an HTTP client that cannot be pointed at internal
// addresses, including after a redirect — each hop dials through the same guard.
func newGuardedHTTPClient(timeout time.Duration) *http.Client {
	transport := &http.Transport{
		DialContext:           guardedDialer(timeout).DialContext,
		TLSHandshakeTimeout:   timeout,
		ResponseHeaderTimeout: timeout,
		DisableKeepAlives:     true,
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many redirects")
			}
			// Scheme is re-checked because a redirect may try to downgrade to a
			// scheme the transport guard does not cover.
			return validateOutboundURL(req.URL.String())
		},
	}
}

// validateOutboundURL rejects URLs that are not plain http(s) or that name a
// literal internal address. Hostnames are left to the dialer guard, which sees
// the resolved address.
func validateOutboundURL(raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	switch strings.ToLower(u.Scheme) {
	case "http", "https":
	default:
		return fmt.Errorf("unsupported URL scheme %q", u.Scheme)
	}
	if u.Host == "" {
		return errors.New("URL is missing a host")
	}
	if allowPrivateTargets() {
		return nil
	}
	host := u.Hostname()
	if ip := net.ParseIP(host); ip != nil && isBlockedIP(ip) {
		return errBlockedTarget
	}
	return nil
}

// allowedProbePorts are the ports a ping target may name. The probe reports
// reachability and timing, so an unrestricted port turns it into a port scanner
// even against public hosts.
var allowedProbePorts = map[int]struct{}{
	53:   {}, // DNS
	80:   {}, // HTTP
	123:  {}, // NTP
	443:  {}, // HTTPS
	853:  {}, // DNS over TLS
	8080: {},
	8443: {},
}

// validateProbeTarget parses a ping target into a dialable address, rejecting
// internal literals and ports outside the allowlist. Hostnames still pass
// through the dialer guard at connect time.
func validateProbeTarget(target string, fallbackPort int) (string, error) {
	target = strings.TrimSpace(target)
	if target == "" {
		return "", errors.New("target is required")
	}
	// Reject a scheme or path: this dials a host:port, not a URL.
	if strings.Contains(target, "/") {
		return "", errors.New("target must be a host or host:port, not a URL")
	}

	host := target
	port := fallbackPort
	explicitPort := false

	if h, p, err := net.SplitHostPort(target); err == nil {
		host = h
		parsed, convErr := strconv.Atoi(p)
		if convErr != nil {
			return "", errors.New("invalid port")
		}
		port = parsed
		explicitPort = true
	} else if strings.Count(target, ":") > 1 {
		// A bare IPv6 literal has several colons and no port.
		host = strings.Trim(target, "[]")
	}

	if host == "" {
		return "", errors.New("target is required")
	}
	// Only an absent port falls back to the default. A port spelled out in the
	// target (or passed alongside it) is honoured or rejected, never rewritten:
	// silently turning ":0" into ":443" would probe somewhere the caller did not
	// ask for.
	if !explicitPort && port <= 0 {
		port = 443
	}
	if port < 1 || port > 65535 {
		return "", errors.New("invalid port")
	}
	if !allowPrivateTargets() {
		if _, ok := allowedProbePorts[port]; !ok {
			return "", fmt.Errorf("port %d is not permitted for probing", port)
		}
		if ip := net.ParseIP(host); ip != nil && isBlockedIP(ip) {
			return "", errBlockedTarget
		}
	}
	return net.JoinHostPort(host, strconv.Itoa(port)), nil
}
