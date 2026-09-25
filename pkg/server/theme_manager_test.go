package server

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// zipTheme builds an in-memory theme package with the given entry files.
func zipTheme(t *testing.T, files map[string]string) *bytes.Reader {
	t.Helper()
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)
	for name, content := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return bytes.NewReader(buf.Bytes())
}

// TestInstallFromZipPermissionDenied pins the failure mode the dashboard's
// theme (plugin) install surfaces when the themes directory is not writable —
// e.g. an unprivileged container whose /app is root-owned. The error has to
// name the directory and point at permissions, not a bare "failed to create
// theme folder".
func TestInstallFromZipPermissionDenied(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignores directory write bits, so the permission failure cannot be simulated")
	}

	base := t.TempDir()
	themesDir := filepath.Join(base, "themes")
	if err := os.MkdirAll(themesDir, 0755); err != nil {
		t.Fatal(err)
	}
	// Strip the write bit so creating the theme's own folder fails.
	if err := os.Chmod(themesDir, 0555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(themesDir, 0755) })

	tm := NewThemeManager(nil, themesDir)
	zipFile := zipTheme(t, map[string]string{
		"komari-theme.json": `{"short":"demo","name":"Demo","version":"1.0.0"}`,
		"index.html":        "<html></html>",
	})

	item, err := tm.InstallFromZip(zipFile, int64(zipFile.Len()))
	if err == nil {
		t.Fatal("install into a read-only themes directory must fail")
	}
	if item != nil {
		t.Fatal("a failed install must not return a theme item")
	}
	if !strings.Contains(err.Error(), "无法创建主题目录") || !strings.Contains(err.Error(), "权限") {
		t.Fatalf("error should name the directory and permissions, got: %v", err)
	}
}

// TestInstallFromZipHappyPath makes sure the error-path change above did not
// break the normal install: manifest parsed, files extracted, index present.
func TestInstallFromZipHappyPath(t *testing.T) {
	base := t.TempDir()
	tm := NewThemeManager(nil, filepath.Join(base, "themes"))

	zipFile := zipTheme(t, map[string]string{
		"komari-theme.json": `{"short":"demo","name":"Demo","version":"1.0.0"}`,
		"index.html":        "<html></html>",
		"assets/app.js":     "console.log(1)",
	})

	item, err := tm.InstallFromZip(zipFile, int64(zipFile.Len()))
	if err != nil {
		t.Fatalf("install failed: %v", err)
	}
	if item.Short != "demo" {
		t.Fatalf("short = %q, want demo", item.Short)
	}
	if _, err := os.Stat(filepath.Join(base, "themes", "demo", "index.html")); err != nil {
		t.Fatalf("index.html not extracted: %v", err)
	}
}

// TestRewriteAssetURL pins the accelerator behavior: GitHub URLs go through
// the configured mirror (prefix style or {url} template style), other hosts
// pass through untouched, and an unset mirror changes nothing.
func TestRewriteAssetURL(t *testing.T) {
	tm := &ThemeManager{}

	// No mirror configured: everything passes through.
	if got := tm.rewriteAssetURL("https://github.com/a/b/releases/download/v1/x.zip"); got != "https://github.com/a/b/releases/download/v1/x.zip" {
		t.Fatalf("empty mirror rewrote the url: %s", got)
	}

	// Prefix style.
	tm.assetMirror = "https://gh-proxy.com/"
	got := tm.rewriteAssetURL("https://github.com/a/b/releases/download/v1/x.zip")
	want := "https://gh-proxy.com/https://github.com/a/b/releases/download/v1/x.zip"
	if got != want {
		t.Fatalf("prefix rewrite = %s, want %s", got, want)
	}

	// Template style with {url}.
	tm.assetMirror = "https://mirror.example.com/fetch?url={url}"
	got = tm.rewriteAssetURL("https://github.com/a/b/releases/download/v1/x.zip")
	want = "https://mirror.example.com/fetch?url=https://github.com/a/b/releases/download/v1/x.zip"
	if got != want {
		t.Fatalf("template rewrite = %s, want %s", got, want)
	}

	// Non-GitHub hosts are never rewritten through the accelerator.
	tm.assetMirror = "https://gh-proxy.com/"
	const selfHosted = "https://themes.internal.example.com/pack.zip"
	if got := tm.rewriteAssetURL(selfHosted); got != selfHosted {
		t.Fatalf("non-github url was rewritten: %s", got)
	}
}

// marketTestServer builds an HTTP test server answering with the given body
// and status, so the market fetch can be exercised without touching GitHub.
func marketTestServer(t *testing.T, status int, body string) *httptest.Server {
	t.Helper()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(ts.Close)
	return ts
}

// TestFetchMarketFallsBackToMirror covers the mainland-China path: raw
// GitHub (the primary) is unreachable, so the identical jsDelivr mirror is
// tried and its payload is used.
func TestFetchMarketFallsBackToMirror(t *testing.T) {
	tm := NewThemeManager(nil, t.TempDir())
	tm.marketURL = marketTestServer(t, 500, "upstream down").URL

	const index = `{"schema":1,"updated_at":"2026-09-25","themes":[{"short":"demo","name":"Demo","version":"9.9.9","download":"https://github.com/demo/demo.zip","sha256":"abc"}]}`
	tm.marketFallbackURL = marketTestServer(t, 200, index).URL

	items, err := tm.FetchMarketThemes()
	if err != nil {
		t.Fatalf("mirror fetch failed: %v", err)
	}
	var found *KomariThemeItem
	for i := range items {
		if items[i].Short == "demo" {
			found = &items[i]
		}
	}
	if found == nil {
		t.Fatalf("mirror payload not applied, items: %+v", items)
	}
	if found.Version != "9.9.9" || found.DownloadURL != "https://github.com/demo/demo.zip" {
		t.Fatalf("unexpected item: %+v", found)
	}
}

// TestFetchMarketCustomURLDisablesFallback: an operator-supplied index is the
// only source consulted — the built-in jsDelivr mirror mirrors the upstream
// file and must not leak entries into a self-hosted market.
func TestFetchMarketCustomURLDisablesFallback(t *testing.T) {
	custom := marketTestServer(t, 404, "not found").URL
	t.Setenv("PROBE_THEME_MARKET_URL", custom)

	tm := NewThemeManager(nil, t.TempDir())
	if tm.marketURL != custom {
		t.Fatalf("marketURL = %s, want the custom index", tm.marketURL)
	}
	if tm.marketFallbackURL != "" {
		t.Fatal("a custom index must disable the built-in jsDelivr fallback")
	}
	if _, err := tm.FetchMarketThemes(); err == nil {
		t.Fatal("a custom index failure must surface as an error, not fall back")
	}
}

// TestDownloadAndInstallUsesAssetMirror runs a full download-install cycle
// where the zip is only reachable through the {url} template accelerator,
// proving the rewrite happens on the actual download path and the SHA256
// check still guards the bytes.
func TestDownloadAndInstallUsesAssetMirror(t *testing.T) {
	zipFile := zipTheme(t, map[string]string{
		"komari-theme.json": `{"short":"mirrored","name":"Mirrored","version":"1.0.0"}`,
		"index.html":        "<html></html>",
	})
	zipBytes := new(bytes.Buffer)
	if _, err := zipBytes.ReadFrom(zipFile); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(zipBytes.Bytes())
	wantSHA := hex.EncodeToString(sum[:])

	base := t.TempDir()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasPrefix(r.URL.Path, "/fetch"):
			if got := r.URL.Query().Get("url"); got != "https://github.com/demo/demo.zip" {
				t.Errorf("accelerator received unexpected url: %s", got)
			}
			_, _ = w.Write(zipBytes.Bytes())
		default:
			http.NotFound(w, r)
		}
	}))
	defer ts.Close()

	tm := NewThemeManager(nil, base)
	tm.assetMirror = ts.URL + "/fetch?url={url}"

	item, err := tm.DownloadAndInstall("https://github.com/demo/demo.zip", wantSHA)
	if err != nil {
		t.Fatalf("mirrored install failed: %v", err)
	}
	if item.Short != "mirrored" {
		t.Fatalf("short = %q, want mirrored", item.Short)
	}
}
