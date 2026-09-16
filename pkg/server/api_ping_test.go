package server

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestPingTargetSaveRejectsBlockedDestinations(t *testing.T) {
	gin.SetMode(gin.TestMode)
	storage, err := NewStorage(filepath.Join(t.TempDir(), "probe.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	s := &Server{storage: storage}

	targets, err := storage.GetPingTargets()
	if err != nil || len(targets) == 0 {
		t.Fatalf("initial targets: %v, %d rows", err, len(targets))
	}
	original := targets[0]

	for _, tc := range []struct {
		name   string
		method string
		body   string
		update bool
	}{
		{"add private TCP", http.MethodPost, `{"label":"local","target":"127.0.0.1","protocol":"tcp","port":443,"enabled":true}`, false},
		{"add private HTTP", http.MethodPost, `{"label":"local","target":"http://169.254.169.254/latest","protocol":"http","enabled":true}`, false},
		{"update public SSH", http.MethodPut, `{"label":"changed","target":"example.com","protocol":"tcp","port":22,"enabled":true}`, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(tc.method, "/api/v1/ping-targets", strings.NewReader(tc.body))
			c.Request.Header.Set("Content-Type", "application/json")
			if tc.update {
				c.Params = gin.Params{{Key: "id", Value: strconv.FormatInt(original.ID, 10)}}
				s.handleUpdatePingTarget(c)
			} else {
				s.handleAddPingTarget(c)
			}
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
		})
	}

	after, err := storage.GetPingTargets()
	if err != nil || len(after) != len(targets) || after[0].Target != original.Target {
		t.Fatalf("rejected save changed storage: %v, %+v", err, after)
	}
}
