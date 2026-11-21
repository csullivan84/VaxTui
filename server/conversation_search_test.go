package server

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestConversationSearchErrors(t *testing.T) {
	for _, tc := range []struct {
		name       string
		cancel     bool
		deadline   bool
		closeDB    bool
		wantStatus int
	}{
		{name: "canceled", cancel: true},
		{name: "deadline", deadline: true, wantStatus: http.StatusInternalServerError},
		{name: "database failure", closeDB: true, wantStatus: http.StatusInternalServerError},
		{name: "database failure with canceled request", cancel: true, closeDB: true, wantStatus: http.StatusInternalServerError},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv, database, _ := newTestServer(t)
			var logs bytes.Buffer
			srv.logger = slog.New(slog.NewTextHandler(&logs, nil))
			if tc.closeDB {
				if err := database.Close(); err != nil {
					t.Fatal(err)
				}
			}
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			if tc.cancel {
				cancel()
			}
			if tc.deadline {
				var deadlineCancel context.CancelFunc
				ctx, deadlineCancel = context.WithDeadline(ctx, time.Unix(0, 0))
				defer deadlineCancel()
			}
			req := httptest.NewRequest(http.MethodGet, "/api/conversations/search?q=pelican", nil).WithContext(ctx)
			recorder := &httptest.ResponseRecorder{Body: new(bytes.Buffer)}
			srv.handleSearchConversations(recorder, req)
			if recorder.Code != tc.wantStatus {
				t.Fatalf("HTTP %d: %s, want %d", recorder.Code, recorder.Body.String(), tc.wantStatus)
			}
			if tc.wantStatus == 0 {
				if recorder.Body.Len() != 0 || logs.Len() != 0 {
					t.Fatalf("canceled search wrote response %q or logs %q", recorder.Body.String(), logs.String())
				}
			} else if !strings.Contains(logs.String(), "Failed to search conversations") {
				t.Fatalf("search failure was not logged: %s", logs.String())
			}
		})
	}
}
