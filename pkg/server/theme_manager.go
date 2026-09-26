package server

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	defaultThemesDir = "themes"
	// defaultThemeMarketURL is the upstream Komari market index. Raw GitHub is
	// unreachable from many mainland-China networks, so fetches fall back to a
	// jsDelivr mirror of the same file before giving up.
	defaultThemeMarketURL = "https://raw.githubusercontent.com/komari-monitor/theme-market/main/v1.json"
	// fallbackThemeMarketURL serves the identical index through jsDelivr's CDN.
	fallbackThemeMarketURL = "https://cdn.jsdelivr.net/gh/komari-monitor/theme-market@main/v1.json"
)

// ThemeManager coordinates installed Komari themes and the community theme market.
type ThemeManager struct {
	mu           sync.RWMutex
	themesDir    string
	activeTheme  string // "builtin" or a theme short identifier
	storage      *Storage
	installed    map[string]*KomariThemeItem
	marketCache  []KomariThemeItem
	lastMarketAt time.Time

	// marketURL is the market index to fetch; marketFallbackURL is tried only
	// when the primary fails and is empty when the operator supplied a custom
	// index (the built-in mirror only mirrors the upstream file). assetMirror
	// optionally rewrites GitHub download URLs through an accelerator.
	marketURL         string
	marketFallbackURL string
	assetMirror       string
}

// NewThemeManager initializes the theme manager with persistence.
func NewThemeManager(storage *Storage, themesDir string) *ThemeManager {
	if themesDir == "" {
		themesDir = defaultThemesDir
	}
	if err := os.MkdirAll(themesDir, 0755); err != nil {
		// Installation would fail later anyway; say so now, at startup, where
		// the cause (a read-only working directory, a root-owned /app) is still
		// visible in the same log.
		log.Printf("[Theme] Cannot create themes directory %q: %v — theme installation will fail until this is writable", themesDir, err)
	}

	tm := &ThemeManager{
		themesDir:   themesDir,
		activeTheme: "builtin",
		storage:     storage,
		installed:   make(map[string]*KomariThemeItem),
		marketURL:   defaultThemeMarketURL,
	}

	// Raw GitHub is unreachable from many mainland-China networks, so the same
	// upstream index is also tried through jsDelivr. A custom index replaces
	// the primary and disables the built-in mirror — it only mirrors the
	// upstream file and would be wrong for a self-hosted market.
	tm.marketFallbackURL = fallbackThemeMarketURL
	if custom := strings.TrimSpace(os.Getenv("PROBE_THEME_MARKET_URL")); custom != "" {
		tm.marketURL = custom
		tm.marketFallbackURL = ""
	}

	// Optional accelerator for the theme package downloads themselves (they
	// point at github.com release assets), e.g. a gh-proxy style prefix.
	tm.assetMirror = strings.TrimSpace(os.Getenv("PROBE_THEME_ASSET_MIRROR"))

	// Load active theme setting from storage
	if storage != nil {
		if val, err := storage.GetSystemSetting("active_theme"); err == nil && val != "" {
			tm.activeTheme = val
		}
	}

	// Initial scan of local themes directory
	tm.ScanInstalled()
	return tm
}

// GetActiveTheme returns the current active theme ("builtin" or theme short).
func (tm *ThemeManager) GetActiveTheme() string {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	return tm.activeTheme
}

// SetActiveTheme updates and persists the active theme.
func (tm *ThemeManager) SetActiveTheme(short string) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if short != "builtin" {
		if _, exists := tm.installed[short]; !exists {
			return fmt.Errorf("theme '%s' is not installed", short)
		}
	}

	tm.activeTheme = short
	if tm.storage != nil {
		_ = tm.storage.SetSystemSetting("active_theme", short)
	}
	log.Printf("[Theme] Switched active theme to: %s", short)
	return nil
}

// ScanInstalled scans the themes directory on disk and registers all valid themes.
func (tm *ThemeManager) ScanInstalled() map[string]*KomariThemeItem {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	result := make(map[string]*KomariThemeItem)

	entries, err := os.ReadDir(tm.themesDir)
	if err != nil {
		log.Printf("[Theme] Failed to read themes directory: %v", err)
		tm.installed = result
		return result
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		themeDir := filepath.Join(tm.themesDir, entry.Name())
		manifestPath := filepath.Join(themeDir, "komari-theme.json")

		data, err := os.ReadFile(manifestPath)
		if err != nil {
			continue
		}

		var manifest KomariThemeManifest
		if err := json.Unmarshal(data, &manifest); err != nil {
			continue
		}

		// Verify theme directory contains an index.html entry point
		hasIndex := false
		if fi, err := os.Stat(filepath.Join(themeDir, "dist", "index.html")); err == nil && !fi.IsDir() {
			hasIndex = true
		} else if fi, err := os.Stat(filepath.Join(themeDir, "index.html")); err == nil && !fi.IsDir() {
			hasIndex = true
		}
		if !hasIndex {
			log.Printf("[Theme] Skipping theme directory '%s': missing dist/index.html and index.html", entry.Name())
			continue
		}

		short := manifest.Short
		if short == "" {
			short = entry.Name()
		}

		name := extractI18nString(manifest.Name, "zh-CN")
		if name == "" {
			name = short
		}
		desc := extractI18nString(manifest.Description, "zh-CN")
		author := extractI18nString(manifest.Author, "zh-CN")

		preview := manifest.Preview
		if preview != "" && !strings.HasPrefix(preview, "http://") && !strings.HasPrefix(preview, "https://") {
			// Local preview file relative to theme folder
			preview = fmt.Sprintf("/themes/%s/%s", short, strings.TrimPrefix(preview, "/"))
		}

		item := &KomariThemeItem{
			Name:        name,
			Short:       short,
			Description: desc,
			Version:     manifest.Version,
			Author:      author,
			URL:         manifest.URL,
			Preview:     preview,
			IsInstalled: true,
			IsActive:    (short == tm.activeTheme),
			Config:      manifest.Configuration,
		}
		result[short] = item
	}

	tm.installed = result
	return result
}

// GetInstalledThemes returns a slice of all installed themes.
func (tm *ThemeManager) GetInstalledThemes() []KomariThemeItem {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	list := make([]KomariThemeItem, 0, len(tm.installed))
	for _, item := range tm.installed {
		clone := *item
		clone.IsActive = (clone.Short == tm.activeTheme)
		list = append(list, clone)
	}
	return list
}

// GetThemeDirPath returns the absolute or relative disk path to a theme's directory.
func (tm *ThemeManager) GetThemeDirPath(short string) (string, error) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	themeDir := filepath.Join(tm.themesDir, short)
	if fi, err := os.Stat(themeDir); err == nil && fi.IsDir() {
		return themeDir, nil
	}
	return "", fmt.Errorf("theme directory for '%s' not found", short)
}

// DeleteTheme removes a theme from disk.
func (tm *ThemeManager) DeleteTheme(short string) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if short == "builtin" {
		return errors.New("cannot delete built-in theme")
	}

	themeDir := filepath.Join(tm.themesDir, short)
	if err := os.RemoveAll(themeDir); err != nil {
		return fmt.Errorf("failed to remove theme directory: %w", err)
	}

	delete(tm.installed, short)
	if tm.activeTheme == short {
		tm.activeTheme = "builtin"
		if tm.storage != nil {
			_ = tm.storage.SetSystemSetting("active_theme", "builtin")
		}
	}
	log.Printf("[Theme] Deleted theme: %s", short)
	return nil
}

// InstallFromZip extracts a theme zip stream into the themes directory.
func (tm *ThemeManager) InstallFromZip(r io.ReaderAt, size int64) (*KomariThemeItem, error) {
	zr, err := zip.NewReader(r, size)
	if err != nil {
		return nil, fmt.Errorf("invalid zip file: %w", err)
	}

	// 1. Locate and parse komari-theme.json to determine short name
	var manifest *KomariThemeManifest
	var prefix string

	for _, f := range zr.File {
		cleanName := filepath.Clean(f.Name)
		if strings.HasSuffix(cleanName, "komari-theme.json") {
			rc, err := f.Open()
			if err != nil {
				continue
			}
			bytes, _ := io.ReadAll(rc)
			_ = rc.Close()

			var m KomariThemeManifest
			if err := json.Unmarshal(bytes, &m); err == nil && m.Short != "" {
				manifest = &m
				prefix = strings.TrimSuffix(f.Name, "komari-theme.json")
				break
			}
		}
	}

	if manifest == nil || manifest.Short == "" {
		return nil, errors.New("theme package is missing a valid komari-theme.json with 'short' identifier")
	}

	targetDir := filepath.Join(tm.themesDir, manifest.Short)
	_ = os.RemoveAll(targetDir) // Clean before install
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return nil, fmt.Errorf("无法创建主题目录 %s：%v。请检查服务端对主题目录（PROBE_THEMES_DIR，默认工作目录下的 themes/）是否有写权限", targetDir, err)
	}

	// 2. Extract files, stripping any top-level wrapping directory prefix
	for _, f := range zr.File {
		relPath := f.Name
		if prefix != "" && strings.HasPrefix(relPath, prefix) {
			relPath = strings.TrimPrefix(relPath, prefix)
		}
		if relPath == "" || strings.HasPrefix(relPath, "/") || strings.Contains(relPath, "..") {
			continue // Prevent Zip Slip vulnerability
		}

		destPath := filepath.Join(targetDir, relPath)
		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(destPath, 0755)
			continue
		}

		_ = os.MkdirAll(filepath.Dir(destPath), 0755)
		destFile, err := os.OpenFile(destPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			continue
		}

		srcFile, err := f.Open()
		if err != nil {
			_ = destFile.Close()
			continue
		}

		_, _ = io.Copy(destFile, srcFile)
		_ = srcFile.Close()
		_ = destFile.Close()
	}

	// 3. Verify that the theme package contains a valid index.html entry point
	hasIndex := false
	if fi, err := os.Stat(filepath.Join(targetDir, "dist", "index.html")); err == nil && !fi.IsDir() {
		hasIndex = true
	} else if fi, err := os.Stat(filepath.Join(targetDir, "index.html")); err == nil && !fi.IsDir() {
		hasIndex = true
	}
	if !hasIndex {
		_ = os.RemoveAll(targetDir)
		return nil, fmt.Errorf("主题包「%s」缺少 index.html 入口（未检测到 dist/index.html 或 index.html），请确认上传的是已打包编译的 Release 发行包，而非未编译的代码仓库", manifest.Short)
	}

	// 4. Rescan to register newly installed theme
	tm.ScanInstalled()

	tm.mu.RLock()
	item, ok := tm.installed[manifest.Short]
	tm.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("failed to register installed theme %s", manifest.Short)
	}

	log.Printf("[Theme] Successfully installed theme: %s (%s)", item.Name, item.Short)
	return item, nil
}

// DownloadAndInstall downloads a theme zip from URL, optionally verifies SHA256, and installs it.
func (tm *ThemeManager) DownloadAndInstall(downloadURL string, expectedSHA256 string) (*KomariThemeItem, error) {
	downloadURL = tm.rewriteAssetURL(downloadURL)
	client := &http.Client{Timeout: 60 * time.Second}
	req, err := http.NewRequest("GET", downloadURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Probe-Server/ThemeManager")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to download theme from %s: %w", downloadURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("server responded with status %d", resp.StatusCode)
	}

	// Save to temporary file
	tmpFile, err := os.CreateTemp("", "probe-theme-*.zip")
	if err != nil {
		return nil, err
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	hasher := sha256.New()
	multiWriter := io.MultiWriter(tmpFile, hasher)

	size, err := io.Copy(multiWriter, resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to stream download: %w", err)
	}

	if expectedSHA256 != "" {
		computedSHA256 := hex.EncodeToString(hasher.Sum(nil))
		if !strings.EqualFold(computedSHA256, expectedSHA256) {
			return nil, fmt.Errorf("SHA256 mismatch: expected %s, got %s", expectedSHA256, computedSHA256)
		}
	}

	return tm.InstallFromZip(tmpFile, size)
}

// rewriteAssetURL routes a theme package download through the configured
// accelerator, if any. The mirror is either a plain prefix ("https://gh-proxy.com/")
// or a template containing "{url}" ("https://mirror.example.com/fetch?url={url}").
// Only GitHub hosts are rewritten — the operator's accelerator is for GitHub
// assets, not for arbitrary hosts — and when the market entry ships a SHA256
// the downloaded bytes are still verified afterwards, so the accelerator
// cannot silently substitute a different package.
func (tm *ThemeManager) rewriteAssetURL(raw string) string {
	mirror := strings.TrimSpace(tm.assetMirror)
	if mirror == "" || raw == "" {
		return raw
	}
	if !strings.Contains(raw, "github.com") && !strings.Contains(raw, "githubusercontent.com") {
		return raw
	}
	if strings.Contains(mirror, "{url}") {
		return strings.ReplaceAll(mirror, "{url}", raw)
	}
	return strings.TrimRight(mirror, "/") + "/" + raw
}

// fetchMarketIndex retrieves and decodes one market index document.
func fetchMarketIndex(client *http.Client, url string) (*KomariMarketPayload, error) {
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("market index responded with status %d", resp.StatusCode)
	}
	var payload KomariMarketPayload
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("failed to decode market payload: %w", err)
	}
	return &payload, nil
}

// FetchMarketThemes retrieves and caches the official Komari theme market directory.
func (tm *ThemeManager) FetchMarketThemes() ([]KomariThemeItem, error) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	// Return cached if fetched within last 5 minutes
	if len(tm.marketCache) > 0 && time.Since(tm.lastMarketAt) < 5*time.Minute {
		return tm.marketCache, nil
	}

	client := &http.Client{Timeout: 15 * time.Second}
	payload, err := fetchMarketIndex(client, tm.marketURL)
	if err != nil && tm.marketFallbackURL != "" {
		// Raw GitHub is unreachable from many mainland-China networks; the
		// jsDelivr mirror carries the identical upstream file.
		log.Printf("[Theme] Market index fetch failed (%v), retrying via jsDelivr mirror", err)
		payload, err = fetchMarketIndex(client, tm.marketFallbackURL)
	}
	if err != nil {
		if len(tm.marketCache) > 0 {
			return tm.marketCache, nil // fallback to stale cache
		}
		return nil, fmt.Errorf("failed to fetch theme market: %w", err)
	}

	items := make([]KomariThemeItem, 0, len(payload.Themes))
	for _, t := range payload.Themes {
		name := extractI18nString(t.Name, "zh-CN")
		if name == "" {
			name = t.Short
		}
		desc := extractI18nString(t.Description, "zh-CN")
		author := extractI18nString(t.Author, "zh-CN")

		_, isInstalled := tm.installed[t.Short]

		items = append(items, KomariThemeItem{
			Name:        name,
			Short:       t.Short,
			Description: desc,
			Version:     t.Version,
			Author:      author,
			URL:         t.URL,
			Preview:     t.Preview,
			DownloadURL: t.Download,
			SHA256:      t.SHA256,
			IsInstalled: isInstalled,
			IsActive:    (t.Short == tm.activeTheme),
		})
	}

	// Ensure btop-terminal is featured in market list
	hasBtop := false
	for _, it := range items {
		if it.Short == "btop-terminal" {
			hasBtop = true
			break
		}
	}
	if !hasBtop {
		_, isInstalled := tm.installed["btop-terminal"]
		btopTheme := KomariThemeItem{
			Name:        "btop++ 极客终端",
			Short:       "btop-terminal",
			Description: "真实还原 Linux 顶级终端监控工具 btop++ 的硬核字符与色块风格，高刷新率、多节点聚合看板与终端沉浸体验",
			Version:     "1.0.3",
			Author:      "wildalley",
			URL:         "https://github.com/wildalley/komari-theme-btop",
			Preview:     "https://raw.githubusercontent.com/wildalley/komari-theme-btop/main/preview.png",
			DownloadURL: "https://github.com/wildalley/komari-theme-btop/releases/download/v1.0.3/btop-terminal.zip",
			SHA256:      "81344fc9c58e7e69d0bcda4a84b8e30f705c931719d0c9843f30cc47fed73344",
			IsInstalled: isInstalled,
			IsActive:    ("btop-terminal" == tm.activeTheme),
		}
		items = append([]KomariThemeItem{btopTheme}, items...)
	}

	tm.marketCache = items
	tm.lastMarketAt = time.Now()
	return items, nil
}

// GetThemeSettings returns configuration settings for an installed theme.
func (tm *ThemeManager) GetThemeSettings(short string) map[string]interface{} {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	settings := make(map[string]interface{})
	item, ok := tm.installed[short]
	if !ok || item == nil || item.Config == nil {
		return settings
	}

	if data, ok := item.Config["data"].([]interface{}); ok {
		for _, d := range data {
			if m, ok := d.(map[string]interface{}); ok {
				if k, ok := m["key"].(string); ok && k != "" {
					if def, exists := m["default"]; exists {
						settings[k] = def
					}
				}
			}
		}
	}
	return settings
}

