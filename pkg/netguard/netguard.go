// Package netguard vets outbound destinations that come from operator-supplied
// input, so that neither the server nor an agent can be pointed at internal
// hosts.
//
// Ping target addresses, webhook URLs and GeoIP lookups all originate inside
// whatever network the process runs in. Without a guard they let an
// authenticated operator reach hosts the internet cannot — cloud metadata
// endpoints (169.254.169.254), localhost services, the rest of the private
// subnet — and read back success/failure and timing. That turns the dashboard
// into an internal port scanner and a request forwarder, and turns the fleet of
// agents into a distributed one.
//
// Operators who genuinely need a LAN destination (a self-hosted webhook
// receiver, an internal host worth monitoring) can opt out with
// PROBE_ALLOW_PRIVATE_TARGETS=1. Agents read the same variable from their own
// environment, so a private probe target needs it set both on the server that
// accepts the target and on every agent that probes it.
package netguard

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

// ErrBlockedTarget is returned when an address falls in a range this package
// refuses to reach.
var ErrBlockedTarget = errors.New("target address is not permitted")

// EnvAllowPrivateTargets names the opt-out variable, read on both the server and
// the agents.
const EnvAllowPrivateTargets = "PROBE_ALLOW_PRIVATE_TARGETS"

// AllowPrivateTargets reports whether the operator disabled the private-range
// guard. Read per call rather than cached so it stays testable and honours an
// env change on restart without extra wiring.
func AllowPrivateTargets() bool {
	v := strings.TrimSpace(os.Getenv(EnvAllowPrivateTargets))
	return v == "1" || strings.EqualFold(v, "true") || strings.EqualFold(v, "yes")
}

// NAT64 translation prefixes. An address here carries an embedded IPv4 address,
// so 64:ff9b::7f00:1 reaches 127.0.0.1 through a translator — and none of the
// ordinary checks notice, because To4 returns nil for this form.
var (
	// nat64WellKnown is RFC 6052's 64:ff9b::/96, whose low 32 bits are the
	// embedded IPv4 address.
	nat64WellKnown = mustCIDR("64:ff9b::/96")

	// nat64LocalUse is RFC 8215's 64:ff9b:1::/48. Its embedded IPv4 sits at an
	// offset that depends on the translator's prefix length, and a local-use
	// translator is internal by definition, so the whole range is refused rather
	// than decoded.
	nat64LocalUse = mustCIDR("64:ff9b:1::/48")
)

func mustCIDR(s string) *net.IPNet {
	_, n, err := net.ParseCIDR(s)
	if err != nil {
		panic("netguard: bad CIDR " + s + ": " + err.Error())
	}
	return n
}

// IsBlockedIP reports whether an address belongs to a range that must not be
// reachable from operator-supplied input.
func IsBlockedIP(ip net.IP) bool {
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
	// are not covered by IsPrivate but are equally internal in practice. To4
	// also yields the embedded address for the ::ffff:a.b.c.d form, so the
	// IPv4-mapped spelling of a blocked address is covered by these checks and
	// by IsPrivate/IsLoopback above.
	if v4 := ip.To4(); v4 != nil {
		if v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127 {
			return true
		}
		if v4[0] == 198 && (v4[1] == 18 || v4[1] == 19) {
			return true
		}
		return false
	}
	// Genuine IPv6 from here on: decode the NAT64 forms of a blocked address.
	if nat64LocalUse.Contains(ip) {
		return true
	}
	if ip16 := ip.To16(); ip16 != nil && nat64WellKnown.Contains(ip) {
		return IsBlockedIP(net.IPv4(ip16[12], ip16[13], ip16[14], ip16[15]))
	}
	return false
}

// GuardedControl is the dialer hook that vets the concrete address the socket is
// about to connect to. Checking here rather than before resolution is what makes
// DNS rebinding ineffective: the name may resolve differently between the check
// and the connect, but this sees the address the syscall actually uses.
func GuardedControl(_ string, address string, _ syscall.RawConn) error {
	if AllowPrivateTargets() {
		return nil
	}
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return ErrBlockedTarget
	}
	if IsBlockedIP(net.ParseIP(host)) {
		return ErrBlockedTarget
	}
	return nil
}

// GuardedDialer dials only addresses that pass the range check.
func GuardedDialer(timeout time.Duration) *net.Dialer {
	return &net.Dialer{
		Timeout: timeout,
		Control: GuardedControl,
	}
}

// DialGuarded connects to addr, refusing internal address ranges.
func DialGuarded(ctx context.Context, addr string, timeout time.Duration) (net.Conn, error) {
	return GuardedDialer(timeout).DialContext(ctx, "tcp", addr)
}

// NewGuardedHTTPClient builds an HTTP client that cannot be pointed at internal
// addresses, including after a redirect — each hop dials through the same guard.
func NewGuardedHTTPClient(timeout time.Duration) *http.Client {
	transport := &http.Transport{
		DialContext:           GuardedDialer(timeout).DialContext,
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
			return ValidateOutboundURL(req.URL.String())
		},
	}
}

// NewGuardedProbeHTTPClient applies the probe port allowlist to every HTTP
// connection, including redirects. The normal guarded client is intentionally
// less restrictive because GeoIP and webhooks are not latency probes.
func NewGuardedProbeHTTPClient(timeout time.Duration) *http.Client {
	client := NewGuardedHTTPClient(timeout)
	transport := client.Transport.(*http.Transport)
	baseDial := transport.DialContext
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		if !AllowPrivateTargets() {
			_, portText, err := net.SplitHostPort(address)
			if err != nil {
				return nil, ErrBlockedTarget
			}
			port, err := strconv.Atoi(portText)
			if err != nil {
				return nil, ErrBlockedTarget
			}
			if _, ok := allowedProbePorts[port]; !ok {
				return nil, fmt.Errorf("port %d is not permitted for probing", port)
			}
		}
		return baseDial(ctx, network, address)
	}
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many redirects")
		}
		return ValidatePingTarget("http", req.URL.String(), 0)
	}
	return client
}

// ValidateOutboundURL rejects URLs that are not plain http(s) or that name a
// literal internal address. Hostnames are left to the dialer guard, which sees
// the resolved address.
func ValidateOutboundURL(raw string) error {
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
	if u.Hostname() == "" {
		return errors.New("URL is missing a host")
	}
	if AllowPrivateTargets() {
		return nil
	}
	host := u.Hostname()
	if ip := net.ParseIP(host); ip != nil && IsBlockedIP(ip) {
		return ErrBlockedTarget
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

// ValidateProbeTarget parses a ping target into a dialable address, rejecting
// internal literals and ports outside the allowlist. Hostnames still pass
// through the dialer guard at connect time.
func ValidateProbeTarget(target string, fallbackPort int) (string, error) {
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
	if !explicitPort && port == 0 {
		port = 443
	}
	if port < 1 || port > 65535 {
		return "", errors.New("invalid port")
	}
	if !AllowPrivateTargets() {
		if _, ok := allowedProbePorts[port]; !ok {
			return "", fmt.Errorf("port %d is not permitted for probing", port)
		}
		if ip := net.ParseIP(host); ip != nil && IsBlockedIP(ip) {
			return "", ErrBlockedTarget
		}
	}
	return net.JoinHostPort(host, strconv.Itoa(port)), nil
}

// ValidatePingTarget vets a stored ping target the way the agents will actually
// use it: TCP and ICMP targets are dialed as host:port, HTTP targets are fetched
// as a URL.
//
// Saving is the first checkpoint for periodic probes. Agents recheck the
// target before connecting, including after receiving older stored rows.
func ValidatePingTarget(protocol, target string, port int) error {
	target = strings.TrimSpace(target)
	if target == "" {
		return errors.New("target is required")
	}
	if strings.EqualFold(strings.TrimSpace(protocol), "http") {
		return validateHTTPProbeTarget(target)
	}
	_, err := ValidateProbeTarget(target, port)
	return err
}

// validateHTTPProbeTarget checks the URL an HTTP-protocol probe will request,
// built the same way the agent builds it.
func validateHTTPProbeTarget(target string) error {
	raw := target
	if !hasHTTPScheme(raw) {
		if strings.Contains(raw, "://") {
			return errors.New("unsupported URL scheme")
		}
		// The agent prepends https:// to a bare host.
		raw = "https://" + raw
	}
	if err := ValidateOutboundURL(raw); err != nil {
		return err
	}
	if AllowPrivateTargets() {
		return nil
	}
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	port, err := urlPort(u)
	if err != nil {
		return err
	}
	// The port allowlist applies here too: an HTTP probe against a public host on
	// an arbitrary port still reports whether that port answers.
	if _, ok := allowedProbePorts[port]; !ok {
		return fmt.Errorf("port %d is not permitted for probing", port)
	}
	return nil
}

func hasHTTPScheme(raw string) bool {
	lower := strings.ToLower(strings.TrimSpace(raw))
	return strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://")
}

// urlPort returns the port a request to u will connect to, explicit or implied
// by the scheme.
func urlPort(u *url.URL) (int, error) {
	if p := u.Port(); p != "" {
		port, err := strconv.Atoi(p)
		if err != nil || port < 1 || port > 65535 {
			return 0, errors.New("invalid port")
		}
		return port, nil
	}
	if strings.EqualFold(u.Scheme, "http") {
		return 80, nil
	}
	return 443, nil
}
