package server

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSecurityThemeIdentifiers(t *testing.T) {
	base := t.TempDir()
	tm := NewThemeManager(nil, filepath.Join(base, "themes"))
	marker := filepath.Join(base, "keep.txt")
	if err := os.WriteFile(marker, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, short := range []string{"", ".", "..", "../victim", "/tmp/victim", `..\victim`, "builtin", "a/b", "a.b", "a:b"} {
		t.Run(short, func(t *testing.T) {
			manifest, _ := json.Marshal(map[string]string{"short": short, "name": "Test"})
			z := zipTheme(t, map[string]string{"komari-theme.json": string(manifest), "index.html": "test"})
			if _, err := tm.InstallFromZip(z, int64(z.Len())); err == nil {
				t.Fatal("unsafe installation accepted")
			}
			if err := tm.DeleteTheme(short); err == nil {
				t.Fatal("unsafe deletion accepted")
			}
			if _, err := tm.GetThemeDirPath(short); err == nil {
				t.Fatal("unsafe lookup accepted")
			}
			if _, err := os.Stat(marker); err != nil {
				t.Fatal("parent directory damaged")
			}
		})
	}
}

func TestSecurityThemeDeleteRoute(t *testing.T) {
	base := t.TempDir()
	s := securityTestServer(t, true)
	t.Setenv("PROBE_THEMES_DIR", filepath.Join(base, "themes"))
	s = NewServer(s.hub, s.storage, s.downsampler, nil, nil, s.auth, true)
	marker := filepath.Join(base, "keep")
	if err := os.WriteFile(marker, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"..", ".", "%2e%2e"} {
		req := httptest.NewRequest("DELETE", "/api/v1/themes/"+name, nil)
		req.Header.Set("Authorization", "Bearer "+securitySession(t, s))
		w := httptest.NewRecorder()
		s.ServeHTTP(w, req)
		if w.Code < 400 {
			t.Fatalf("unsafe delete status=%d", w.Code)
		}
		if _, err := os.Stat(marker); err != nil {
			t.Fatal("parent damaged")
		}
	}
}

func TestSecurityThemeFailedUpdatePreservesExisting(t *testing.T) {
	tm := NewThemeManager(nil, t.TempDir())
	install := func(files map[string]string) error {
		z := zipTheme(t, files)
		_, err := tm.InstallFromZip(z, int64(z.Len()))
		return err
	}
	const manifest = `{"short":"safe-theme","name":"Safe"}`
	if err := install(map[string]string{"komari-theme.json": manifest, "index.html": "old"}); err != nil {
		t.Fatal(err)
	}
	if err := tm.SetActiveTheme("safe-theme"); err != nil {
		t.Fatal(err)
	}
	for _, files := range []map[string]string{
		{"komari-theme.json": manifest, "assets/app.js": "no index"},
		{"komari-theme.json": manifest, "index.html": "bad", "../outside.txt": "escape"},
		{"komari-theme.json": manifest, "index.html": "bad", `assets\evil.js`: "escape"},
		{"komari-theme.json": manifest, "index.html": "bad", "assets/large": strings.Repeat("x", int(maxThemeFileBytes)+1)},
	} {
		if err := install(files); err == nil {
			t.Fatal("invalid archive accepted")
		}
		got, err := os.ReadFile(filepath.Join(tm.themesDir, "safe-theme", "index.html"))
		if err != nil || string(got) != "old" {
			t.Fatal("failed update changed existing theme")
		}
		if tm.GetActiveTheme() != "safe-theme" {
			t.Fatal("failed update changed active theme")
		}
	}
	if err := install(map[string]string{"komari-theme.json": manifest, "index.html": "new"}); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(filepath.Join(tm.themesDir, "safe-theme", "index.html"))
	if string(got) != "new" {
		t.Fatal("valid upgrade failed")
	}
	entries, _ := os.ReadDir(tm.themesDir)
	if len(entries) != 1 {
		t.Fatal("temporary installation directories leaked")
	}
	if err := tm.DeleteTheme("safe-theme"); err != nil {
		t.Fatal(err)
	}
	if tm.GetActiveTheme() != "builtin" {
		t.Fatal("deleting active theme did not restore builtin")
	}
}

func TestSecurityThemeRejectsSymlinks(t *testing.T) {
	base := t.TempDir()
	tm := NewThemeManager(nil, filepath.Join(base, "themes"))
	victim := filepath.Join(base, "victim")
	if err := os.Mkdir(victim, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(victim, filepath.Join(tm.themesDir, "linked")); err != nil {
		t.Fatal(err)
	}
	z := zipTheme(t, map[string]string{"komari-theme.json": `{"short":"linked"}`, "index.html": "bad"})
	if _, err := tm.InstallFromZip(z, int64(z.Len())); err == nil {
		t.Fatal("symlink destination accepted")
	}
	if _, err := os.Stat(filepath.Join(victim, "index.html")); !os.IsNotExist(err) {
		t.Fatal("wrote outside themes root")
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	manifest, _ := zw.Create("komari-theme.json")
	manifest.Write([]byte(`{"short":"link-package"}`))
	header := &zip.FileHeader{Name: "index.html"}
	header.SetMode(os.ModeSymlink | 0777)
	link, _ := zw.CreateHeader(header)
	link.Write([]byte("../../victim"))
	zw.Close()
	if _, err := tm.InstallFromZip(bytes.NewReader(buf.Bytes()), int64(buf.Len())); err == nil {
		t.Fatal("symlink entry accepted")
	}
}

func TestSecurityThemeArchiveLimitsAndWrapping(t *testing.T) {
	tm := NewThemeManager(nil, t.TempDir())
	z := zipTheme(t, map[string]string{"wrapper/komari-theme.json": `{"short":"wrapped"}`, "wrapper/dist/index.html": "valid"})
	if _, err := tm.InstallFromZip(z, int64(z.Len())); err != nil {
		t.Fatalf("wrapped release rejected: %v", err)
	}
	if _, err := tm.InstallFromZip(z, maxThemeArchiveBytes+1); err == nil {
		t.Fatal("oversized archive accepted")
	}
	for _, kind := range []string{"count", "expanded", "duplicate", "manifest"} {
		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		w, _ := zw.Create("komari-theme.json")
		w.Write([]byte(`{"short":"limits"}`))
		switch kind {
		case "count":
			for i := 0; i < maxThemeFiles; i++ {
				zw.Create("file")
			}
		case "expanded":
			for i := 0; i < 5; i++ {
				zw.CreateRaw(&zip.FileHeader{Name: "file", UncompressedSize64: uint64(maxThemeFileBytes)})
			}
		case "duplicate":
			for i := 0; i < 2; i++ {
				w, _ := zw.Create("index.html")
				w.Write([]byte("duplicate"))
			}
		case "manifest":
			w, _ := zw.Create("other/komari-theme.json")
			w.Write([]byte(`{"short":"other"}`))
		}
		zw.Close()
		if _, err := tm.InstallFromZip(bytes.NewReader(buf.Bytes()), int64(buf.Len())); err == nil {
			t.Fatalf("%s limit ignored", kind)
		}
	}
}
