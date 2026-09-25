package server

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestFlagAndLogoAssetResolver(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Create temporary theme directory with mock assets
	tmpDir, err := os.MkdirTemp("", "probe-test-themes-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	serverStatusDir := filepath.Join(tmpDir, "ServerStatus", "dist", "assets")
	flagsDir := filepath.Join(serverStatusDir, "flags")
	if err := os.MkdirAll(flagsDir, 0755); err != nil {
		t.Fatalf("failed to create flags dir: %v", err)
	}

	// Create mock files
	_ = os.WriteFile(filepath.Join(flagsDir, "DE.svg"), []byte("<svg>DE</svg>"), 0644)
	_ = os.WriteFile(filepath.Join(flagsDir, "US.svg"), []byte("<svg>US</svg>"), 0644)
	_ = os.WriteFile(filepath.Join(flagsDir, "UN.svg"), []byte("<svg>UN</svg>"), 0644)
	_ = os.WriteFile(filepath.Join(serverStatusDir, "os-alpine-D5yptyyi.webp"), []byte("alpine-webp"), 0644)
	_ = os.WriteFile(filepath.Join(serverStatusDir, "os-arch-DGfmQXtJ.svg"), []byte("<svg>arch</svg>"), 0644)
	_ = os.WriteFile(filepath.Join(serverStatusDir, "linux-DcxfgrbN.svg"), []byte("<svg>linux</svg>"), 0644)

	storage, err := NewStorage(":memory:")
	if err != nil {
		t.Fatalf("failed to create memory storage: %v", err)
	}
	defer storage.Close()

	tm := NewThemeManager(storage, tmpDir)
	s := &Server{
		router:       gin.New(),
		themeManager: tm,
	}

	s.router.GET("/assets/flags/*filepath", s.handleFlagAsset(tm))
	s.router.HEAD("/assets/flags/*filepath", s.handleFlagAsset(tm))
	s.router.GET("/assets/logo/*filepath", s.handleLogoAsset(tm))
	s.router.HEAD("/assets/logo/*filepath", s.handleLogoAsset(tm))

	tests := []struct {
		method   string
		path     string
		wantCode int
	}{
		{"GET", "/assets/flags/DE.svg", http.StatusOK},
		{"HEAD", "/assets/flags/DE.svg", http.StatusOK},
		{"GET", "/assets/flags/EU-DE.svg", http.StatusOK},
		{"GET", "/assets/flags/US-West.svg", http.StatusOK},
		{"GET", "/assets/flags/LOCAL.svg", http.StatusOK},
		{"GET", "/assets/flags/NONEXISTENT.svg", http.StatusOK}, // falls back to UN.svg
		{"GET", "/assets/logo/os-alpine.webp", http.StatusOK},
		{"GET", "/assets/logo/os-arch.svg", http.StatusOK},
		{"HEAD", "/assets/logo/os-arch.svg", http.StatusOK},
		{"GET", "/assets/logo/linux.svg", http.StatusOK},
		{"GET", "/assets/logo/unknown-os.svg", http.StatusOK}, // falls back to linux.svg
	}

	for _, tc := range tests {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		w := httptest.NewRecorder()
		s.router.ServeHTTP(w, req)

		if w.Code != tc.wantCode {
			t.Errorf("%s %s got status %d, want %d", tc.method, tc.path, w.Code, tc.wantCode)
		}
	}
}

// TestAssetResolverBuiltinFallbacks covers a deployment with no installed
// themes: third-party themes reference unhashed /assets/logo/... URLs and
// depend on other installed themes to supply them, so with nothing on disk
// the resolvers must still answer with the built-in neutral icons instead of
// a 404 that renders as a broken image.
func TestAssetResolverBuiltinFallbacks(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tmpDir := t.TempDir()
	storage, err := NewStorage(":memory:")
	if err != nil {
		t.Fatalf("failed to create memory storage: %v", err)
	}
	defer storage.Close()

	tm := NewThemeManager(storage, tmpDir)
	s := &Server{router: gin.New(), themeManager: tm}
	s.router.GET("/assets/flags/*filepath", s.handleFlagAsset(tm))
	s.router.GET("/assets/logo/*filepath", s.handleLogoAsset(tm))

	for _, path := range []string{"/assets/logo/os-debian.svg", "/assets/logo/linux.webp", "/assets/flags/us.svg"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		w := httptest.NewRecorder()
		s.router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("%s got status %d, want 200 (built-in fallback)", path, w.Code)
			continue
		}
		if ct := w.Header().Get("Content-Type"); ct != "image/svg+xml" {
			t.Errorf("%s content-type = %q, want image/svg+xml", path, ct)
		}
		if !bytes.HasPrefix(w.Body.Bytes(), []byte("<svg")) {
			t.Errorf("%s body is not an svg: %q", path, w.Body.String()[:20])
		}
	}
}
