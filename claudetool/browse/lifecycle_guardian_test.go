//go:build unix

package browse

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"reflect"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/chromedp/cdproto/page"
)

type guardianPipe struct{ close func() error }

func (pipe guardianPipe) Close() error { return pipe.close() }

func fakeBrowserGroup(events *[]string) *browserProcessGroup {
	return &browserProcessGroup{pid: 321,
		stdin: guardianPipe{close: func() error { *events = append(*events, "pipe-close"); return nil }},
		signal: func(pid int, sig syscall.Signal) error {
			if pid != -321 || sig != syscall.SIGKILL {
				return errors.New("unexpected group signal")
			}
			*events = append(*events, "signal-owned-group")
			return nil
		},
		wait: func() error { *events = append(*events, "reap-guardian"); return nil },
	}
}

func TestBrowserGroupPinsPIDUntilSignal(t *testing.T) {
	var events []string
	group := fakeBrowserGroup(&events)
	if err := group.kill(); err != nil {
		t.Fatal(err)
	}
	want := []string{"signal-owned-group", "pipe-close", "reap-guardian"}
	if !reflect.DeepEqual(events, want) {
		t.Fatalf("lifetime order=%v want=%v; reaping first permits same-PGID reuse", events, want)
	}
	if err := group.kill(); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(events, want) {
		t.Fatalf("closed guardian would signal a reused PID: %v", events)
	}
}

func TestBrowserGroupSignalFailureRetainsPIDLease(t *testing.T) {
	var events []string
	group := fakeBrowserGroup(&events)
	group.signal = func(int, syscall.Signal) error { events = append(events, "denied-signal"); return syscall.EPERM }
	if err := group.kill(); !errors.Is(err, syscall.EPERM) {
		t.Fatalf("error=%v", err)
	}
	if !reflect.DeepEqual(events, []string{"denied-signal"}) || group.closed {
		t.Fatalf("failed signal must not release PID lease: %v closed=%v", events, group.closed)
	}
}

func TestBrowserCommandCancellationUsesPinnedOwner(t *testing.T) {
	var events []string
	group := fakeBrowserGroup(&events)
	cmd := &exec.Cmd{Cancel: func() error { events = append(events, "standalone-child-kill"); return nil }}
	configureBrowserCmd(cmd, group)
	if cmd.SysProcAttr == nil || !cmd.SysProcAttr.Setpgid || cmd.SysProcAttr.Pgid != group.pid {
		t.Fatal("Chrome did not join the retained group")
	}
	if err := cmd.Cancel(); err != nil {
		t.Fatal(err)
	}
	if err := group.kill(); err != nil {
		t.Fatal(err)
	}
	if want := []string{"signal-owned-group", "pipe-close", "reap-guardian"}; !reflect.DeepEqual(events, want) {
		t.Fatalf("cancel/cleanup did not share one retained owner: %v", events)
	}
}

func TestBrowserGroupCleanupPrecedesAllocatorReap(t *testing.T) {
	var events []string
	tools := &BrowseTools{browserGroup: fakeBrowserGroup(&events), browserCtxCancel: func() { events = append(events, "browser-cancel") }, allocCancel: func() { events = append(events, "allocator-reap") }}
	tools.Close()
	want := []string{"signal-owned-group", "pipe-close", "reap-guardian", "browser-cancel", "allocator-reap"}
	if !reflect.DeepEqual(events, want) {
		t.Fatalf("cleanup=%v want=%v", events, want)
	}
	tools.Close()
	if !reflect.DeepEqual(events, want) {
		t.Fatalf("repeated Close changed cleanup: %v", events)
	}
}

func TestBrowserGroupConcurrentCancellationReapsOnce(t *testing.T) {
	var events []string
	group := fakeBrowserGroup(&events)
	var callers sync.WaitGroup
	for range 8 {
		callers.Go(func() {
			if err := group.kill(); err != nil {
				t.Error(err)
			}
		})
	}
	callers.Wait()
	if want := []string{"signal-owned-group", "pipe-close", "reap-guardian"}; !reflect.DeepEqual(events, want) {
		t.Fatalf("concurrent cleanup repeated a stale signal/wait: %v", events)
	}
}

func TestBrowserGroupInterruptedSignalKeepsLease(t *testing.T) {
	var events []string
	group := fakeBrowserGroup(&events)
	signal := group.signal
	attempts := 0
	group.signal = func(pid int, sig syscall.Signal) error {
		attempts++
		if attempts == 1 {
			return syscall.EINTR
		}
		return signal(pid, sig)
	}
	if err := group.kill(); err != nil {
		t.Fatal(err)
	}
	if attempts != 2 || !reflect.DeepEqual(events, []string{"signal-owned-group", "pipe-close", "reap-guardian"}) {
		t.Fatalf("interrupted signal released lease: attempts=%d events=%v", attempts, events)
	}
}

func TestBrowserGroupReapErrorDoesNotRetryRecycledPID(t *testing.T) {
	var events []string
	group := fakeBrowserGroup(&events)
	waitErr := errors.New("reap failed")
	group.wait = func() error { events = append(events, "reap-error"); return waitErr }
	if err := group.kill(); !errors.Is(err, waitErr) {
		t.Fatalf("lost reap error: %v", err)
	}
	if err := group.kill(); !errors.Is(err, waitErr) {
		t.Fatalf("lost recorded reap error: %v", err)
	}
	if want := []string{"signal-owned-group", "pipe-close", "reap-error"}; !reflect.DeepEqual(events, want) {
		t.Fatalf("cleanup repeated a released PID: %v", events)
	}
}

func TestBrowserCloseWaitsForPublishedScreencastStart(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	entered, release, waited := make(chan struct{}), make(chan struct{}), make(chan struct{})
	startResult, closeResult := make(chan error, 1), make(chan struct{}, 1)
	encoder := &fakeScreencastEncoder{writer: &fakeScreencastWriter{}}
	var path string
	tools := &BrowseTools{screencast: screencastState{
		newEncoder: func(_, output string) (screencastEncoder, error) {
			path = output
			return encoder, os.WriteFile(output, []byte("recording"), 0o600)
		},
		startCDP: func(context.Context, page.ScreencastFormat, int64, int64, int64, int64) error {
			close(entered)
			<-release
			return nil
		},
		stopCDP:   func(context.Context) error { return nil },
		startWait: func() { close(waited) },
	}}
	t.Cleanup(func() {
		select {
		case <-release:
		default:
			close(release)
		}
		if path != "" {
			_ = os.Remove(path)
		}
	})
	if err := tools.beginScreencastStart(); err != nil {
		t.Fatal(err)
	}
	go func() { _, err := tools.screencastStartWithContext(ctx, "jpeg", 60, 1280, 720, 1); startResult <- err }()
	select {
	case <-entered:
	case <-ctx.Done():
		t.Fatal("start did not reach CDP boundary")
	}
	go func() { tools.Close(); closeResult <- struct{}{} }()
	select {
	case <-waited:
	case <-closeResult:
		t.Fatal("browser Close claimed resources before startup completed")
	case <-ctx.Done():
		t.Fatal("browser Close did not await startup")
	}
	close(release)
	select {
	case err := <-startResult:
		if err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal("start did not finish")
	}
	select {
	case <-closeResult:
	case <-ctx.Done():
		t.Fatal("browser Close did not finish")
	}
	if encoder.waits != 1 || encoder.stops != 0 {
		t.Fatalf("Close wait/stop=%d/%d want=1/0", encoder.waits, encoder.stops)
	}
}
