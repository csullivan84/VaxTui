package claudetool

import (
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Shelley's own temp files: background job logs and exit files in
// shelley-jobs (see bashJobDir), and large-output dumps in shelley-output-*.
// A finished job's files and an output dump go after finishedJobMaxAge; a log
// with no exit file may belong to a quiet job that is still running, so it
// goes only after orphanLogMaxAge.
const (
	finishedJobMaxAge = 7 * 24 * time.Hour
	orphanLogMaxAge   = 30 * 24 * time.Hour
)

// PruneStaleTempFiles removes Shelley's stale temp files from os.TempDir()
// and returns how many entries it removed. Run once at startup.
func PruneStaleTempFiles(now time.Time) int {
	return pruneStaleTempFiles(os.TempDir(), now)
}

func pruneStaleTempFiles(tempDir string, now time.Time) int {
	removed := 0
	older := func(info os.FileInfo, age time.Duration) bool {
		return now.Sub(info.ModTime()) > age
	}

	jobs := filepath.Join(tempDir, "shelley-jobs")
	if entries, err := os.ReadDir(jobs); err == nil {
		for _, e := range entries {
			name := e.Name()
			if e.IsDir() {
				continue
			}
			if id, ok := strings.CutSuffix(name, ".exit"); ok {
				// An exit file whose log is already gone.
				exitPath := filepath.Join(jobs, name)
				if _, err := os.Stat(filepath.Join(jobs, id+".log")); os.IsNotExist(err) {
					if info, err := os.Stat(exitPath); err == nil && older(info, finishedJobMaxAge) && os.Remove(exitPath) == nil {
						removed++
					}
				}
				continue
			}
			if !strings.HasSuffix(name, ".log") {
				continue
			}
			id := strings.TrimSuffix(name, ".log")
			logPath := filepath.Join(jobs, name)
			exitPath := filepath.Join(jobs, id+".exit")
			logInfo, err := os.Stat(logPath)
			if err != nil {
				continue
			}
			if exitInfo, err := os.Stat(exitPath); err == nil {
				if older(exitInfo, finishedJobMaxAge) && older(logInfo, finishedJobMaxAge) {
					if os.Remove(logPath) == nil {
						removed++
					}
					if os.Remove(exitPath) == nil {
						removed++
					}
				}
				continue
			}
			if older(logInfo, orphanLogMaxAge) && os.Remove(logPath) == nil {
				removed++
			}
		}
	}

	if entries, err := os.ReadDir(tempDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() || !strings.HasPrefix(e.Name(), "shelley-output-") {
				continue
			}
			info, err := e.Info()
			if err != nil || !older(info, finishedJobMaxAge) {
				continue
			}
			if os.RemoveAll(filepath.Join(tempDir, e.Name())) == nil {
				removed++
			}
		}
	}
	return removed
}
