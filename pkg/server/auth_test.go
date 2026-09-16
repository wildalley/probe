package server

import (
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestSessionRevocationCannotBeUndoneByValidation(t *testing.T) {
	storage, err := NewStorage(filepath.Join(t.TempDir(), "probe.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	am := &AuthManager{storage: storage, cache: make(map[string]*sessionEntry)}

	for _, revoke := range []struct {
		name string
		fn   func(string)
	}{
		{"logout", am.Revoke},
		{"password change", func(string) { am.RevokeAllForUser("admin") }},
	} {
		t.Run(revoke.name, func(t *testing.T) {
			token := "test-" + revoke.name
			if err := storage.CreateSession(hashSessionToken(token), "admin", time.Now().Add(time.Hour).Unix(), "", ""); err != nil {
				t.Fatal(err)
			}
			var wg sync.WaitGroup
			wg.Add(1)
			go func() {
				defer wg.Done()
				for i := 0; i < 100; i++ {
					am.Validate(token)
				}
			}()
			revoke.fn(token)
			wg.Wait()
			if _, ok := am.Validate(token); ok {
				t.Fatal("revoked session was cached again")
			}
		})
	}
}

func TestPasswordChangeRevokesOldSession(t *testing.T) {
	t.Setenv("PROBE_ADMIN_PASSWORD", "old-password-123")
	storage, err := NewStorage(filepath.Join(t.TempDir(), "probe.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	am, err := NewAuthManager(storage, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := am.Login("admin", "old-password-123", "127.0.0.1", "test")
	if err != nil {
		t.Fatal(err)
	}
	if err := am.ChangePassword("admin", "old-password-123", "new-password-123"); err != nil {
		t.Fatal(err)
	}
	if _, ok := am.Validate(token); ok {
		t.Fatal("old session survived password change")
	}
	if _, _, err := am.Login("admin", "old-password-123", "127.0.0.1", "test"); err != errInvalidCredentials {
		t.Fatalf("old password accepted: %v", err)
	}
	if _, _, err := am.Login("admin", "new-password-123", "127.0.0.1", "test"); err != nil {
		t.Fatalf("new password rejected: %v", err)
	}
}
