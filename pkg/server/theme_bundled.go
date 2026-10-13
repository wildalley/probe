package server

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io/fs"
	"log"
	"path"
)

// SeedBundledThemes installs the themes shipped inside the server binary into
// the themes directory, so a deploy carries them without a manual ZIP upload.
// Each top-level directory of fsys is one theme (komari-theme.json + dist/).
// A theme is (re)installed only when missing or when its version differs from
// the installed copy; the active theme selection is left untouched.
func (s *Server) SeedBundledThemes(fsys fs.FS) {
	if fsys == nil {
		return
	}
	entries, err := fs.ReadDir(fsys, ".")
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if err := s.themeManager.seedBundledTheme(fsys, entry.Name()); err != nil {
			log.Printf("[Theme] Failed to install bundled theme %q: %v", entry.Name(), err)
		}
	}
}

func (tm *ThemeManager) seedBundledTheme(fsys fs.FS, dir string) error {
	data, err := fs.ReadFile(fsys, path.Join(dir, "komari-theme.json"))
	if err != nil {
		return err
	}
	var manifest KomariThemeManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return err
	}
	tm.mu.RLock()
	installed, ok := tm.installed[manifest.Short]
	tm.mu.RUnlock()
	if ok && installed.Version == manifest.Version {
		return nil
	}

	// Going through the ZIP installer reuses its validation and its atomic
	// replace-with-rollback, instead of a second copy path into themesDir.
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	sub, err := fs.Sub(fsys, dir)
	if err != nil {
		return err
	}
	if err := zw.AddFS(sub); err != nil {
		return err
	}
	if err := zw.Close(); err != nil {
		return err
	}
	item, err := tm.InstallFromZip(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		return err
	}
	log.Printf("[Theme] Installed bundled theme %s %s", item.Short, item.Version)
	return nil
}
