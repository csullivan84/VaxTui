package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"shelley.exe.dev/claudetool"
	"shelley.exe.dev/db/generated"
)

// ExecMessage is the message format for terminal websocket communication.
// Server -> client uses TermID in an "attached" message so the browser can
// remember the persistent session id across reloads.
type ExecMessage struct {
	Type   string `json:"type"`
	Data   string `json:"data,omitempty"`
	Cols   uint16 `json:"cols,omitempty"`
	Rows   uint16 `json:"rows,omitempty"`
	TermID string `json:"term_id,omitempty"`
}

// handleExecWS handles websocket connections that proxy to a persistent
// terminal session. New sessions use exe-scroll; legacy dtach sessions remain
// attachable.
//
// Query params:
//   - term_id: existing session id to re-attach to (preferred)
//   - cmd:     command to start a new session (required if term_id missing)
//   - cwd:     working directory for new sessions
func (s *Server) handleExecWS(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	q := r.URL.Query()
	termID := q.Get("term_id")
	cmd := q.Get("cmd")
	cwd := q.Get("cwd")
	conversationID := q.Get("conversation_id")
	workspaceID := q.Get("workspace_id")
	model := q.Get("model")
	userEmail := r.Header.Get("X-ExeDev-Email")

	if termID == "" && cmd == "" {
		http.Error(w, "cmd or term_id parameter required", http.StatusBadRequest)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		CompressionMode: websocket.CompressionDisabled,
	})
	if err != nil {
		s.logger.Error("Failed to upgrade websocket", "error", err)
		return
	}
	defer conn.Close(websocket.StatusInternalError, "internal error")

	var initMsg ExecMessage
	if err := wsjson.Read(ctx, conn, &initMsg); err != nil {
		s.logger.Debug("Failed to read init message", "error", err)
		return
	}
	if initMsg.Type != "init" {
		conn.Close(websocket.StatusPolicyViolation, "expected init message")
		return
	}
	cols := initMsg.Cols
	rows := initMsg.Rows
	if cols == 0 {
		cols = 80
	}
	if rows == 0 {
		rows = 24
	}

	var slug string
	if conversationID != "" {
		if conv, err := s.db.GetConversationByID(ctx, conversationID); err == nil && conv.Slug != nil {
			slug = *conv.Slug
		}
	}
	extraEnv := buildTerminalEnv(conversationID, slug, model, userEmail, cwd, s.listenPort)
	if termID == "" {
		workspace, workspaceErr := s.workspaceForTerminal(ctx, workspaceID, cwd)
		if workspaceErr != nil {
			_ = wsjson.Write(ctx, conn, ExecMessage{Type: "error", Data: workspaceErr.Error()})
			_ = conn.Close(websocket.StatusPolicyViolation, "invalid workspace")
			return
		}
		workspaceID = workspace.ID
		if cwd == "" {
			cwd = workspace.Path
		}
	}
	sess, dc, err := s.attachOrSpawn(termID, cmd, cwd, conversationID, cols, rows, extraEnv, workspaceID)
	if err != nil {
		wsjson.Write(ctx, conn, ExecMessage{Type: "error", Data: err.Error()})
		conn.Close(websocket.StatusInternalError, "attach failed")
		return
	}
	defer dc.Close()

	// Tell the client which session it ended up on (especially important if it
	// was just spawned).
	if err := wsjson.Write(ctx, conn, ExecMessage{Type: "attached", TermID: sess.ID}); err != nil {
		return
	}

	// Push the up-to-date PTY size from the client side.
	_ = dc.SendResize(cols, rows)

	s.bridgeWS(ctx, conn, dc, sess.ID)
}

// buildTerminalEnv returns the SHELLEY_* environment variables to inject into
// ephemeral / persistent terminals spawned from the UI. It shares the same
// claudetool.ShelleyEnv used by the agent's bash/shell tools so interactive
// "!" commands and agent-run commands see an identical environment.
func buildTerminalEnv(conversationID, slug, model, userEmail, cwd string, listenPort int) []string {
	return claudetool.ShelleyEnv{
		ConversationID:   conversationID,
		ConversationSlug: slug,
		Model:            model,
		UserEmail:        userEmail,
		Port:             listenPort,
	}.Environ(cwd)
}

// attachOrSpawn attaches to an existing session or spawns a new one.
//
// A term_id means "attach to this session and nothing else": if the record is
// gone or the socket is dead, that is an error. Re-running the original command
// behind the user's back would silently restart work they believe has finished.
// Spawning is only reached when the caller supplied no term_id at all.
//
// conversationID is the conversation owner recorded for newly spawned sessions.
// workspaceID is the workspace owner. Reattaching never changes ownership.
func (s *Server) attachOrSpawn(termID, cmd, cwd, conversationID string, cols, rows uint16, extraEnv []string, workspaceID string) (*TerminalSession, terminalClient, error) {
	unlock := s.terminals.LockAttach()
	defer unlock()
	if termID != "" {
		sess := s.terminals.Get(termID)
		if sess == nil {
			return nil, nil, fmt.Errorf("unknown terminal id %s", termID)
		}
		client, err := s.terminals.Attach(sess, cols, rows)
		if err != nil {
			// Stale record: the session is gone for good.
			s.terminals.Forget(termID)
			return nil, nil, fmt.Errorf("terminal %s no longer running", termID)
		}
		return sess, client, nil
	}
	return s.terminals.Spawn(cmd, cwd, conversationID, workspaceID, cols, rows, extraEnv)
}

// bridgeWS shuttles bytes between the browser websocket and a terminal session.
func (s *Server) bridgeWS(ctx context.Context, conn *websocket.Conn, client terminalClient, termID string) {
	var exited bool

	terminalDone := make(chan struct{})
	go func() {
		defer close(terminalDone)
		for {
			message, err := client.Recv()
			if err != nil {
				if !errors.Is(err, io.EOF) && !errors.Is(err, os.ErrClosed) {
					s.logger.Debug("terminal recv error", "error", err)
				}
				return
			}
			switch message.kind {
			case terminalOutput:
				if len(message.data) == 0 {
					continue
				}
				if err := wsjson.Write(ctx, conn, ExecMessage{
					Type: "output",
					Data: base64.StdEncoding.EncodeToString(message.data),
				}); err != nil {
					return
				}
			case terminalExit:
				exited = true
				_ = wsjson.Write(ctx, conn, ExecMessage{Type: "exit", Data: fmt.Sprintf("%d", message.exitCode)})
				return
			}
		}
	}()

	go func() {
		<-terminalDone
		if exited {
			s.terminals.Forget(termID)
			conn.Close(websocket.StatusNormalClosure, "process exited")
		} else {
			conn.Close(websocket.StatusGoingAway, "detached")
		}
	}()

	for {
		var msg ExecMessage
		if err := wsjson.Read(ctx, conn, &msg); err != nil {
			return
		}
		switch msg.Type {
		case "input":
			if msg.Data == "" {
				continue
			}
			if err := client.SendInput([]byte(msg.Data)); err != nil {
				return
			}
		case "resize":
			if msg.Cols > 0 && msg.Rows > 0 {
				_ = client.SendResize(msg.Cols, msg.Rows)
			}
		}
	}
}

type terminalOwner struct {
	HerdID   string
	HerdName string
}

// terminalDTO is the wire representation of a terminal. ConversationID is a
// pointer so a global terminal serializes as null rather than "": this is the
// only place the on-disk empty string is turned into the API's null.
type terminalDTO struct {
	ID             string  `json:"id"`
	Command        string  `json:"command"`
	Cwd            string  `json:"cwd"`
	CreatedAt      string  `json:"created_at"`
	OwnerType      string  `json:"owner_type"`
	WorkspaceID    string  `json:"workspace_id,omitempty"`
	HerdID         string  `json:"herd_id,omitempty"`
	HerdName       string  `json:"herd_name,omitempty"`
	ConversationID *string `json:"conversation_id"`
}

// terminalOwners returns the herd assignment for each live terminal. Workspace
// ownership lives on the terminal session; herd ownership lives in the
// database so detach/move operations remain atomic.
func (s *Server) terminalOwners(ctx context.Context) (map[string]terminalOwner, error) {
	owners := make(map[string]terminalOwner)
	err := s.db.WithTx(ctx, func(q *generated.Queries) error {
		herds, err := q.ListHerds(ctx)
		if err != nil {
			return err
		}
		herdNames := make(map[string]string, len(herds))
		for _, herd := range herds {
			herdNames[herd.ID] = herd.Name
		}
		members, err := q.ListAllHerdMembers(ctx)
		if err != nil {
			return err
		}
		for _, member := range members {
			if member.TerminalID == nil || *member.TerminalID == "" {
				continue
			}
			owners[*member.TerminalID] = terminalOwner{
				HerdID:   member.HerdID,
				HerdName: herdNames[member.HerdID],
			}
		}
		return nil
	})
	return owners, err
}

func makeTerminalDTO(t *TerminalSession, owner terminalOwner) terminalDTO {
	ownerType := "workspace"
	if owner.HerdID != "" {
		ownerType = "herd"
	} else if t.WorkspaceID == "" {
		ownerType = "unowned"
	}
	var convID *string
	if t.ConversationID != "" {
		id := t.ConversationID
		convID = &id
	}
	return terminalDTO{
		ID:             t.ID,
		Command:        t.Command,
		Cwd:            t.Cwd,
		CreatedAt:      t.CreatedAt.UTC().Format(time.RFC3339),
		OwnerType:      ownerType,
		WorkspaceID:    t.WorkspaceID,
		HerdID:         owner.HerdID,
		HerdName:       owner.HerdName,
		ConversationID: convID,
	}
}

// handleTerminalsList responds with the current set of persistent terminals.
// The list is deliberately unfiltered: the client holds one canonical terminal
// collection and decides per conversation what to show.
func (s *Server) handleTerminalsList(w http.ResponseWriter, r *http.Request) {
	owners, err := s.terminalOwners(r.Context())
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "list_terminal_owners_failed", err.Error(), nil)
		return
	}
	list := s.terminals.List()
	out := make([]terminalDTO, 0, len(list))
	for _, t := range list {
		out = append(out, makeTerminalDTO(t, owners[t.ID]))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// handleTerminalScope handles PUT /api/terminals/{id}/scope, moving a terminal
// between conversation-local and global.
//
// Body is {"conversation_id": "<id>"} for local or {"conversation_id": null}
// for global. null is the only accepted spelling of global: an absent field or
// an empty string is rejected so a malformed client cannot quietly publish a
// terminal to every conversation.
func (s *Server) handleTerminalScope(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<16))
	if err != nil {
		http.Error(w, "cannot read body", http.StatusBadRequest)
		return
	}
	// An absent conversation_id and an explicit null both decode to a nil
	// pointer, so check for the key textually before trusting the pointer.
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		http.Error(w, "malformed JSON body", http.StatusBadRequest)
		return
	}
	if _, ok := raw["conversation_id"]; !ok {
		http.Error(w, "conversation_id is required (use null for a global terminal)", http.StatusBadRequest)
		return
	}
	var body struct {
		ConversationID *string `json:"conversation_id"`
	}
	if err := json.Unmarshal(data, &body); err != nil {
		http.Error(w, "malformed JSON body", http.StatusBadRequest)
		return
	}
	conversationID := ""
	if body.ConversationID != nil {
		conversationID = *body.ConversationID
		if conversationID == "" {
			http.Error(w, "conversation_id must be a conversation id or null", http.StatusBadRequest)
			return
		}
		if _, err := s.db.GetConversationByID(r.Context(), conversationID); err != nil {
			http.Error(w, "unknown conversation", http.StatusNotFound)
			return
		}
	}
	sess, err := s.terminals.SetConversationID(id, conversationID)
	if errors.Is(err, ErrNoSuchTerminal) {
		http.Error(w, "unknown terminal", http.StatusNotFound)
		return
	}
	if err != nil {
		s.logger.Error("failed to update terminal scope", "id", id, "error", err)
		http.Error(w, "failed to update terminal scope", http.StatusInternalServerError)
		return
	}
	owner := terminalOwner{}
	if owners, ownerErr := s.terminalOwners(r.Context()); ownerErr == nil {
		owner = owners[sess.ID]
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(makeTerminalDTO(sess, owner))
}

// handleTerminalDelete kills a session and removes its on-disk record.
func (s *Server) handleTerminalDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	if err := s.terminals.Kill(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleWorkspaceTerminalsDelete closes every non-herd terminal. It reports
// all outcomes so one failed process cannot hide terminals already closed.
func (s *Server) handleWorkspaceTerminalsDelete(w http.ResponseWriter, r *http.Request) {
	owners, err := s.terminalOwners(r.Context())
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "list_terminal_owners_failed", err.Error(), nil)
		return
	}
	closed := make([]string, 0)
	failed := make(map[string]string)
	for _, terminal := range s.terminals.List() {
		if owners[terminal.ID].HerdID != "" {
			continue
		}
		if err := s.terminals.Kill(terminal.ID); err != nil {
			failed[terminal.ID] = err.Error()
			continue
		}
		closed = append(closed, terminal.ID)
	}
	writeJSON(w, http.StatusOK, map[string]any{"closed": closed, "failed": failed})
}
