package server

import (
	"archive/zip"
	"bytes"
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
