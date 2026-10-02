//go:build unix

package browse

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"syscall"
)

// A private guardian remains our unreaped child until cleanup completes. Its
// PID pins the process-group number even if it exits, avoiding PID/PGID reuse
// between an ownership check and a group signal. Only kill calls its waiter.
type browserProcessGroup struct {
	mu     sync.Mutex
	pid    int
	closed bool
	err    error
	cmd    *exec.Cmd
	stdin  io.Closer
	signal func(int, syscall.Signal) error
	wait   func() error
}

func startBrowserProcessGroup() (*browserProcessGroup, error) {
	reader, writer, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	cmd := exec.Command("/bin/sh", "-c", "IFS= read -r _")
	cmd.Env = []string{"PATH=/usr/bin:/bin"}
	cmd.Stdin = reader
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		return nil, errors.Join(err, reader.Close(), writer.Close())
	}
	group := &browserProcessGroup{pid: cmd.Process.Pid, cmd: cmd, stdin: writer, signal: syscall.Kill, wait: cmd.Wait}
	if err := reader.Close(); err != nil {
		return nil, errors.Join(err, group.kill())
	}
	return group, nil
}

// Chrome joins the retained guardian's group. Its context cancellation uses the
// same owner instead of a potentially stale standalone numeric child signal.
func configureBrowserCmd(cmd *exec.Cmd, group *browserProcessGroup) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setpgid = true
	cmd.SysProcAttr.Pgid = group.pid
	setPdeathsig(cmd.SysProcAttr)
	cmd.Cancel = group.kill
}

func (group *browserProcessGroup) kill() error {
	if group == nil {
		return nil
	}
	group.mu.Lock()
	defer group.mu.Unlock()
	if group.closed {
		return group.err
	}
	if group.pid <= 0 {
		return fmt.Errorf("invalid owned browser group")
	}
	for {
		err := group.signal(-group.pid, syscall.SIGKILL)
		if errors.Is(err, syscall.EINTR) {
			continue
		}
		if err != nil && !errors.Is(err, syscall.ESRCH) {
			// Retain the unreaped guardian and pipe: a retry must still own the
			// same PID lease. Never convert failed signalling into cleanup success.
			return fmt.Errorf("signal owned browser group %d: %w", group.pid, err)
		}
		break
	}
	closeErr := group.stdin.Close()
	waitErr := group.wait()
	// After Wait, never signal this numeric group again, including when a wait
	// error prevents us from claiming complete cleanup.
	group.closed = true
	var exited *exec.ExitError
	if errors.As(waitErr, &exited) {
		// Killing the guardian normally produces an ExitError, not a reap error.
		waitErr = nil
	}
	group.err = errors.Join(closeErr, waitErr)
	return group.err
}
