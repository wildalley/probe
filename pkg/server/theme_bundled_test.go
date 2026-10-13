package server

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

func bundledThemeFS(version, page string) fstest.MapFS {
	return fstest.MapFS{
		"demo/komari-theme.json":  {Data: []byte(`{"name":"Demo","short":"demo","version":"` + version + `"}`)},
		"demo/dist/index.html":    {Data: []byte(page)},
		"demo/dist/vendor/lib.js": {Data: []byte("export {}")},
		"not-a-theme.txt":         {Data: []byte("ignored")},
	}
}

func TestSeedBundledThemesInstallsAndServes(t *testing.T) {
	base := t.TempDir()
	s := securityTestServer(t, true)
	t.Setenv("PROBE_THEMES_DIR", filepath.Join(base, "themes"))
	s = NewServer(s.hub, s.storage, s.downsampler, nil, nil, s.auth, true)

	s.SeedBundledThemes(bundledThemeFS("1.0.0", "demo v1"))
	if themes := s.themeManager.GetInstalledThemes(); len(themes) != 1 || themes[0].Short != "demo" {
		t.Fatalf("installed = %+v", themes)
	}

	req := httptest.NewRequest("POST", "/api/v1/themes/active", strings.NewReader(`{"theme":"demo"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+securitySession(t, s))
	w := httptest.NewRecorder()
	s.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("activate status=%d body=%s", w.Code, w.Body)
	}

	for path, want := range map[string]string{"/": "demo v1", "/vendor/lib.js": "export {}"} {
		req := httptest.NewRequest("GET", path, nil)
		req.Header.Set("Authorization", "Bearer "+securitySession(t, s))
		w := httptest.NewRecorder()
		s.ServeHTTP(w, req)
		if w.Code != 200 || !strings.Contains(w.Body.String(), want) {
			t.Fatalf("GET %s status=%d body=%q", path, w.Code, w.Body)
		}
	}
}

func TestSeedBundledThemesUpgradesOnlyOnVersionChange(t *testing.T) {
	tm := NewThemeManager(nil, filepath.Join(t.TempDir(), "themes"))
	s := &Server{themeManager: tm}
	index := filepath.Join(tm.themesDir, "demo", "dist", "index.html")

	s.SeedBundledThemes(bundledThemeFS("1.0.0", "v1"))
	if err := os.WriteFile(index, []byte("local edit"), 0644); err != nil {
		t.Fatal(err)
	}
	s.SeedBundledThemes(bundledThemeFS("1.0.0", "v1"))
	if got, _ := os.ReadFile(index); string(got) != "local edit" {
		t.Fatalf("same version reinstalled: %q", got)
	}
	s.SeedBundledThemes(bundledThemeFS("1.1.0", "v2"))
	if got, _ := os.ReadFile(index); string(got) != "v2" {
		t.Fatalf("new version not installed: %q", got)
	}
}
