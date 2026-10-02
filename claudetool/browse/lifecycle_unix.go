//go:build unix

package browse

import (
	"log"
	"os/exec"
	"syscall"
)

var browserGetpgid = syscall.Getpgid
var browserKill = syscall.Kill

// configureBrowserCmd sets platform-specific options on the headless-shell command.
func configureBrowserCmd(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setpgid = true
	setPdeathsig(cmd.SysProcAttr)
}

// killBrowserProcessGroup kills only a still-live group whose leader remains the
// browser process we launched. Once the leader is reaped its numeric PGID may
// be reused; signalling that former group is unsafe.
func killBrowserProcessGroup(pid int) {
	if pid <= 0 {
		return
	}
	pgid, err := browserGetpgid(pid)
	if err != nil || pgid != pid {
		if err != nil {
			log.Printf("browse: browser process group %d is no longer verifiable: %v", pid, err)
		}
		return
	}
	if err := browserKill(-pid, syscall.SIGKILL); err != nil && err != syscall.ESRCH {
		log.Printf("browse: failed to kill headless-shell process group %d: %v", pid, err)
	}
}
