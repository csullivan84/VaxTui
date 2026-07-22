package server

import (
	"path/filepath"
	"testing"
)

// samePath reports whether a and b refer to the same filesystem path after
// resolving symlinks. On macOS, t.TempDir() is under /var/folders/... while
// git/realpath often returns /private/var/folders/....
func samePath(a, b string) bool {
	ra, errA := filepath.EvalSymlinks(a)
	rb, errB := filepath.EvalSymlinks(b)
	if errA != nil {
		ra = filepath.Clean(a)
	}
	if errB != nil {
		rb = filepath.Clean(b)
	}
	return ra == rb
}

func assertSamePath(t *testing.T, got, want string) {
	t.Helper()
	if !samePath(got, want) {
		t.Errorf("path mismatch: got %q, want %q", got, want)
	}
}
