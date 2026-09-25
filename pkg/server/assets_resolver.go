package server

import (
	_ "embed"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

// Built-in neutral fallbacks served when no installed theme carries the
// requested asset. Third-party themes reference these icons through unhashed
// /assets/logo/... URLs and depend on other installed themes to supply them —
// a deployment without e.g. ServerStatus would otherwise render broken images
// for every OS icon the active theme does not bundle itself.
var (
	//go:embed assets_fallback/generic-os.svg
	genericOSIcon []byte

	//go:embed assets_fallback/generic-flag.svg
	genericFlagAsset []byte
)

var (
	resolverMu       sync.RWMutex
	cachedLogoFiles  = make(map[string]string)
	cachedFlagDirs   []string
	lastLogoScanTime int64
)

// handleFlagAsset resolves national and regional flag SVGs with intelligent fallbacks.
// It handles multi-part region codes (e.g. EU-DE -> DE.svg, US-West -> US.svg),
// local networks (LOCAL -> UN.svg), and defaults to UN.svg on unknown regions.
func (s *Server) handleFlagAsset(tm *ThemeManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := filepath.Base(filepath.Clean(c.Param("filepath")))
		if raw == "." || raw == "/" || raw == "" {
			c.Status(http.StatusNotFound)
			return
		}

		ext := strings.ToLower(filepath.Ext(raw))
		if ext == "" {
			ext = ".svg"
		}
		base := strings.TrimSuffix(raw, filepath.Ext(raw))
		upper := strings.ToUpper(base)

		// Build prioritized candidate codes
		var candidates []string
		candidates = append(candidates, upper)

		if strings.Contains(upper, "-") || strings.Contains(upper, "_") {
			parts := strings.FieldsFunc(upper, func(r rune) bool {
				return r == '-' || r == '_'
			})
			// Check suffix parts first (e.g., "EU-DE" -> "DE", "US-WEST" -> "US")
			for i := len(parts) - 1; i >= 0; i-- {
				candidates = append(candidates, parts[i])
			}
			for i := 0; i < len(parts); i++ {
				candidates = append(candidates, parts[i])
			}
		}

		if upper == "LOCAL" || upper == "LAN" || upper == "LOOPBACK" || upper == "PRIVATE" || upper == "UNKNOWN" {
			candidates = append(candidates, "UN")
		}
		// Final fallback to UN (United Nations) flag
		candidates = append(candidates, "UN")

		is4x3 := strings.Contains(c.Request.URL.Path, "flags-4x3")
		primaryDirName := "flags"
		secondaryDirName := "flags-4x3"
		if is4x3 {
			primaryDirName = "flags-4x3"
			secondaryDirName = "flags"
		}

		// Search directories
		var searchDirs []string
		if active := tm.GetActiveTheme(); active != "builtin" && active != "" {
			searchDirs = append(searchDirs,
				filepath.Join(tm.themesDir, active, "dist", "assets", primaryDirName),
				filepath.Join(tm.themesDir, active, "dist", "assets", secondaryDirName),
			)
		}
		// ServerStatus always carries a complete flag library
		searchDirs = append(searchDirs,
			filepath.Join(tm.themesDir, "ServerStatus", "dist", "assets", primaryDirName),
			filepath.Join(tm.themesDir, "ServerStatus", "dist", "assets", secondaryDirName),
		)

		// Also check any other installed theme
		entries, _ := os.ReadDir(tm.themesDir)
		for _, e := range entries {
			if e.IsDir() && e.Name() != "ServerStatus" && e.Name() != tm.GetActiveTheme() {
				searchDirs = append(searchDirs,
					filepath.Join(tm.themesDir, e.Name(), "dist", "assets", primaryDirName),
				)
			}
		}

		// Try matching candidates
		for _, dir := range searchDirs {
			fi, err := os.Stat(dir)
			if err != nil || !fi.IsDir() {
				continue
			}

			for _, cand := range candidates {
				fileCandidate := filepath.Join(dir, cand+ext)
				if sfi, err := os.Stat(fileCandidate); err == nil && !sfi.IsDir() {
					c.Header("Cache-Control", "public, max-age=86400")
					http.ServeFile(c.Writer, c.Request, fileCandidate)
					return
				}
				// Also try lower-case file candidate
				fileCandidateLower := filepath.Join(dir, strings.ToLower(cand)+ext)
				if sfi, err := os.Stat(fileCandidateLower); err == nil && !sfi.IsDir() {
					c.Header("Cache-Control", "public, max-age=86400")
					http.ServeFile(c.Writer, c.Request, fileCandidateLower)
					return
				}
			}
		}

		// Fallback: search for UN.svg anywhere in searchDirs
		for _, dir := range searchDirs {
			unFile := filepath.Join(dir, "UN.svg")
			if sfi, err := os.Stat(unFile); err == nil && !sfi.IsDir() {
				c.Header("Cache-Control", "public, max-age=86400")
				http.ServeFile(c.Writer, c.Request, unFile)
				return
			}
		}

		// Nothing on disk: serve the built-in neutral flag rather than a 404
		// that turns into a broken image in the theme.
		c.Header("Cache-Control", "public, max-age=86400")
		c.Header("Content-Type", "image/svg+xml")
		_, _ = c.Writer.Write(genericFlagAsset)
	}
}

// handleLogoAsset resolves unhashed OS logos (e.g. os-alpine.webp, os-arch.svg, linux.svg)
// to hashed assets in installed themes (e.g. os-alpine-D5yptyyi.webp) with fallbacks.
func (s *Server) handleLogoAsset(tm *ThemeManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := filepath.Base(filepath.Clean(c.Param("filepath")))
		if raw == "." || raw == "/" || raw == "" {
			c.Status(http.StatusNotFound)
			return
		}

		reqExt := strings.ToLower(filepath.Ext(raw))
		reqBase := strings.ToLower(strings.TrimSuffix(raw, reqExt))

		// Normalize known aliases and typos from external themes
		switch reqBase {
		case "os-kail":
			reqBase = "os-kali"
		case "os-astar":
			reqBase = "os-astra"
		case "os-manjaro-":
			reqBase = "os-manjaro"
		case "os-opensuse":
			reqBase = "os-opensuse"
		case "os-opencloudos":
			reqBase = "os-opencloudos"
		case "unknown":
			reqBase = "linux"
		}

		// Search directories for hashed OS assets
		var assetDirs []string
		if active := tm.GetActiveTheme(); active != "builtin" && active != "" {
			assetDirs = append(assetDirs, filepath.Join(tm.themesDir, active, "dist", "assets"))
		}
		assetDirs = append(assetDirs, filepath.Join(tm.themesDir, "ServerStatus", "dist", "assets"))

		// Check any other installed theme
		entries, _ := os.ReadDir(tm.themesDir)
		for _, e := range entries {
			if e.IsDir() && e.Name() != "ServerStatus" && e.Name() != tm.GetActiveTheme() {
				assetDirs = append(assetDirs, filepath.Join(tm.themesDir, e.Name(), "dist", "assets"))
			}
		}

		// Pass 1: exact extension match (e.g., prefix `os-alpine-` and ext `.webp`)
		for _, dir := range assetDirs {
			files, err := os.ReadDir(dir)
			if err != nil {
				continue
			}
			for _, f := range files {
				if f.IsDir() {
					continue
				}
				nameLower := strings.ToLower(f.Name())
				if (strings.HasPrefix(nameLower, reqBase+"-") || strings.HasPrefix(nameLower, reqBase+".")) &&
					strings.HasSuffix(nameLower, reqExt) {
					targetPath := filepath.Join(dir, f.Name())
					c.Header("Cache-Control", "public, max-age=86400")
					http.ServeFile(c.Writer, c.Request, targetPath)
					return
				}
			}
		}

		// Pass 2: any image extension match (e.g., requested .ico but asset is .png or .svg)
		validExts := []string{".svg", ".webp", ".png", ".ico", ".jpg", ".jpeg"}
		for _, dir := range assetDirs {
			files, err := os.ReadDir(dir)
			if err != nil {
				continue
			}
			for _, f := range files {
				if f.IsDir() {
					continue
				}
				nameLower := strings.ToLower(f.Name())
				if strings.HasPrefix(nameLower, reqBase+"-") || strings.HasPrefix(nameLower, reqBase+".") {
					for _, ve := range validExts {
						if strings.HasSuffix(nameLower, ve) {
							targetPath := filepath.Join(dir, f.Name())
							c.Header("Cache-Control", "public, max-age=86400")
							http.ServeFile(c.Writer, c.Request, targetPath)
							return
						}
					}
				}
			}
		}

		// Pass 3: Fallback to linux-*.svg or os-generic-*.svg
		for _, dir := range assetDirs {
			files, err := os.ReadDir(dir)
			if err != nil {
				continue
			}
			for _, f := range files {
				if f.IsDir() {
					continue
				}
				nameLower := strings.ToLower(f.Name())
				if strings.HasPrefix(nameLower, "os-generic-") || strings.HasPrefix(nameLower, "linux-") {
					targetPath := filepath.Join(dir, f.Name())
					c.Header("Cache-Control", "public, max-age=86400")
					http.ServeFile(c.Writer, c.Request, targetPath)
					return
				}
			}
		}

		log.Printf("[AssetsResolver] Logo not found in any installed theme: %s — serving built-in generic icon", raw)
		c.Header("Cache-Control", "public, max-age=86400")
		c.Header("Content-Type", "image/svg+xml")
		_, _ = c.Writer.Write(genericOSIcon)
	}
}
