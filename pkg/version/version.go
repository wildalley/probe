// Package version carries the release version stamped into every binary at
// link time.
//
// Both probe-server and probe-agent link this package, but each is linked
// separately, so -X gives each binary its own value from the same symbol. The
// zero configuration default is "dev": a binary built without the flag is
// still a working binary, it just cannot be told apart from any other
// unstamped build.
package version

// Version is the release version, injected with
//
//	-ldflags "-X probe/pkg/version.Version=1.2.3"
//
// The Makefile derives it from git describe, so a local build reports the
// commit it came from rather than a placeholder.
var Version = "dev"
