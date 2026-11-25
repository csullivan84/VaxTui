package claudetool

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func touch(t *testing.T, path string, age time.Duration, now time.Time) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	when := now.Add(-age)
	if err := os.Chtimes(path, when, when); err != nil {
		t.Fatal(err)
	}
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func TestPruneStaleTempFiles(t *testing.T) {
	tmp := t.TempDir()
	now := time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)
	jobs := filepath.Join(tmp, "shelley-jobs")
	day := 24 * time.Hour

	// A finished job older than a week: both files go.
	touch(t, filepath.Join(jobs, "old.log"), 8*day, now)
	touch(t, filepath.Join(jobs, "old.exit"), 8*day, now)
	// A finished job from yesterday: both stay.
	touch(t, filepath.Join(jobs, "new.log"), day, now)
	touch(t, filepath.Join(jobs, "new.exit"), day, now)
	// A quiet job with no exit file yet, 10 days old: may still be running, stays.
	touch(t, filepath.Join(jobs, "quiet.log"), 10*day, now)
	// An orphaned log with no exit file, 31 days old: goes.
	touch(t, filepath.Join(jobs, "orphan.log"), 31*day, now)
	// An exit file whose log is already gone, older than a week: goes.
	touch(t, filepath.Join(jobs, "lone.exit"), 8*day, now)
	// Large-output dumps: a week-old one goes, yesterday's stays.
	touch(t, filepath.Join(tmp, "shelley-output-old", "output"), 8*day, now)
	os.Chtimes(filepath.Join(tmp, "shelley-output-old"), now.Add(-8*day), now.Add(-8*day))
	touch(t, filepath.Join(tmp, "shelley-output-new", "output"), day, now)
	// Something else in the temp dir is never touched, however old.
	touch(t, filepath.Join(tmp, "someone-else.log"), 90*day, now)

	removed := pruneStaleTempFiles(tmp, now)

	for _, gone := range []string{"shelley-jobs/old.log", "shelley-jobs/old.exit", "shelley-jobs/orphan.log", "shelley-jobs/lone.exit", "shelley-output-old"} {
		if exists(filepath.Join(tmp, gone)) {
			t.Errorf("%s should have been removed", gone)
		}
	}
	for _, kept := range []string{"shelley-jobs/new.log", "shelley-jobs/new.exit", "shelley-jobs/quiet.log", "shelley-output-new/output", "someone-else.log"} {
		if !exists(filepath.Join(tmp, kept)) {
			t.Errorf("%s should have been kept", kept)
		}
	}
	if removed != 5 {
		t.Errorf("removed = %d, want 5", removed)
	}
}

func TestPruneStaleTempFilesMissingDir(t *testing.T) {
	if n := pruneStaleTempFiles(filepath.Join(t.TempDir(), "absent"), time.Now()); n != 0 {
		t.Errorf("removed = %d from a missing dir, want 0", n)
	}
}
