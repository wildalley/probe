package server

import (
	"archive/zip"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"strings"
)

const (
	maxThemeArchiveBytes  int64 = 32 << 20
	maxThemeFileBytes     int64 = 32 << 20
	maxThemeExpandedBytes int64 = 128 << 20
	maxThemeManifestBytes int64 = 128 << 10
	maxThemeFiles               = 4096
)

// A theme identifier is a single portable directory name, never a path.
func validateThemeShort(short string) error {
	if short == "" || len(short) > 128 || short == "builtin" || short[0] == '.' {
		return errors.New("invalid theme identifier")
	}
	for _, c := range short {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
			return errors.New("theme identifier must contain only letters, digits, hyphens and underscores")
		}
	}
	return nil
}

// InstallFromZip validates and extracts into a disposable directory. All disk
// operations are rooted in the themes directory, including replacement and
// rollback, so archive paths cannot escape it even through symlinks.
func (tm *ThemeManager) InstallFromZip(r io.ReaderAt, size int64) (*KomariThemeItem, error) {
	if size <= 0 || size > maxThemeArchiveBytes {
		return nil, errors.New("theme archive exceeds size limit")
	}
	zr, err := zip.NewReader(r, size)
	if err != nil {
		return nil, fmt.Errorf("invalid zip file: %w", err)
	}
	if len(zr.File) > maxThemeFiles {
		return nil, errors.New("theme archive has too many files")
	}
	var manifest *KomariThemeManifest
	var prefix string
	var total uint64
	for _, f := range zr.File {
		name := strings.TrimSuffix(f.Name, "/")
		if name == "" || strings.Contains(name, "\\") || strings.HasPrefix(name, "/") || path.Clean(name) != name || name == ".." || strings.HasPrefix(name, "../") {
			return nil, errors.New("unsafe path in theme archive")
		}
		if !f.Mode().IsRegular() && !f.FileInfo().IsDir() {
			return nil, errors.New("theme archive contains a link or special file")
		}
		if f.UncompressedSize64 > uint64(maxThemeFileBytes) {
			return nil, errors.New("theme file exceeds size limit")
		}
		total += f.UncompressedSize64
		if total > uint64(maxThemeExpandedBytes) {
			return nil, errors.New("expanded theme exceeds size limit")
		}
		if path.Base(name) != "komari-theme.json" || f.FileInfo().IsDir() {
			continue
		}
		if manifest != nil {
			return nil, errors.New("theme archive has multiple manifests")
		}
		if f.UncompressedSize64 > uint64(maxThemeManifestBytes) {
			return nil, errors.New("theme manifest exceeds size limit")
		}
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		data, readErr := io.ReadAll(io.LimitReader(rc, maxThemeManifestBytes+1))
		_ = rc.Close()
		if readErr != nil {
			return nil, readErr
		}
		if len(data) > int(maxThemeManifestBytes) {
			return nil, errors.New("theme manifest exceeds size limit")
		}
		var m KomariThemeManifest
		if err := json.Unmarshal(data, &m); err != nil {
			return nil, err
		}
		if err := validateThemeShort(m.Short); err != nil {
			return nil, err
		}
		manifest = &m
		prefix = strings.TrimSuffix(f.Name, "komari-theme.json")
	}
	if manifest == nil {
		return nil, errors.New("theme package is missing a valid komari-theme.json with 'short' identifier")
	}

	tm.installMu.Lock()
	defer tm.installMu.Unlock()
	root, err := os.OpenRoot(tm.themesDir)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	stage := ".install-" + rand.Text()
	if err := root.Mkdir(stage, 0755); err != nil {
		return nil, fmt.Errorf("无法创建主题目录：%w。请检查服务端对主题目录的写入权限", err)
	}
	defer root.RemoveAll(stage)
	extracted, err := root.OpenRoot(stage)
	if err != nil {
		return nil, err
	}
	defer extracted.Close()
	remaining := maxThemeExpandedBytes
	for _, f := range zr.File {
		if !strings.HasPrefix(f.Name, prefix) {
			continue
		}
		rel := strings.TrimSuffix(strings.TrimPrefix(f.Name, prefix), "/")
		if rel == "" {
			continue
		}
		if f.FileInfo().IsDir() {
			if err := extracted.MkdirAll(rel, 0755); err != nil {
				return nil, err
			}
			continue
		}
		if err := extracted.MkdirAll(path.Dir(rel), 0755); err != nil {
			return nil, err
		}
		// O_EXCL also rejects duplicate archive entries and file/directory clashes.
		out, err := extracted.OpenFile(rel, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
		if err != nil {
			return nil, err
		}
		src, err := f.Open()
		if err != nil {
			_ = out.Close()
			return nil, err
		}
		limit := min(maxThemeFileBytes, remaining)
		n, copyErr := io.Copy(out, io.LimitReader(src, limit+1))
		_ = src.Close()
		closeErr := out.Close()
		if copyErr != nil {
			return nil, copyErr
		}
		if closeErr != nil {
			return nil, closeErr
		}
		if n > limit {
			return nil, errors.New("expanded theme exceeds size limit")
		}
		remaining -= n
	}
	hasIndex := false
	for _, name := range []string{"dist/index.html", "index.html"} {
		if fi, err := extracted.Stat(name); err == nil && fi.Mode().IsRegular() {
			hasIndex = true
		}
	}
	if !hasIndex {
		return nil, errors.New("主题包缺少 index.html 入口，请上传已编译的 Release 发行包")
	}
	_ = extracted.Close()

	// Keep the previous installation available for rollback if rename fails.
	backup := ".backup-" + rand.Text()
	hadPrevious := false
	if fi, err := root.Lstat(manifest.Short); err == nil {
		if !fi.IsDir() || fi.Mode()&os.ModeSymlink != 0 {
			return nil, errors.New("theme destination is not a regular directory")
		}
		if err := root.Rename(manifest.Short, backup); err != nil {
			return nil, err
		}
		hadPrevious = true
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	if err := root.Rename(stage, manifest.Short); err != nil {
		if hadPrevious {
			if rollbackErr := root.Rename(backup, manifest.Short); rollbackErr != nil {
				return nil, fmt.Errorf("install failed: %v; previous theme retained in %s: %w", err, backup, rollbackErr)
			}
		}
		return nil, err
	}
	if hadPrevious {
		_ = root.RemoveAll(backup)
	}
	tm.ScanInstalled()
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	item, ok := tm.installed[manifest.Short]
	if !ok {
		return nil, errors.New("failed to register installed theme")
	}
	clone := *item
	return &clone, nil
}
