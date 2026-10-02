package browse

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/page"

	"shelley.exe.dev/llm"
)

func TestScreencastStartStop(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping browser test in short mode")
	}

	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()

	tools := NewBrowseTools(ctx, 0)
	t.Cleanup(func() {
		tools.Close()
	})

	// Verify no screencast is running.
	active, _, _, _ := tools.screencastStatus()
	if active {
		t.Fatal("expected no active screencast")
	}

	// Start via combined tool.
	tool := tools.CombinedTool()
	out := tool.Run(ctx, json.RawMessage(`{"action":"resize","width":881,"height":495}`))
	if out.Error != nil {
		t.Fatalf("resize: %v", out.Error)
	}
	out = tool.Run(ctx, json.RawMessage(`{"action":"screencast_start"}`))
	text := contentText(t, out)
	if !strings.Contains(text, "Screencast recording") {
		if strings.Contains(text, "failed to start browser") || strings.Contains(text, "ffmpeg") {
			t.Skip("Browser or ffmpeg not available")
		}
		t.Fatalf("unexpected start result: %s", text)
	}
	if !strings.Contains(text, ".mp4") {
		t.Fatalf("expected .mp4 in start message, got: %s", text)
	}
	t.Logf("Start result: %s", text)

	// Double-start should error.
	out = tool.Run(ctx, json.RawMessage(`{"action":"screencast_start"}`))
	text = contentText(t, out)
	if !strings.Contains(text, "already active") {
		t.Fatalf("expected already-active error, got: %s", text)
	}

	// Navigate to generate some frames.
	out = tool.Run(ctx, json.RawMessage(`{"action":"navigate","url":"data:text/html,<h1>Screencast Test</h1>"}`))
	text = contentText(t, out)
	if strings.Contains(text, "Error") {
		t.Fatalf("navigate failed: %s", text)
	}

	// Poll until we have at least one frame.
	var sessionID string
	var frameCount int
	var elapsed time.Duration
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var active bool
		active, sessionID, frameCount, elapsed = tools.screencastStatus()
		if active && frameCount > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if frameCount == 0 {
		t.Fatal("expected at least one screencast frame")
	}
	t.Logf("Status: session=%s frames=%d elapsed=%v", sessionID, frameCount, elapsed)

	// Stop via combined tool.
	out = tool.Run(ctx, json.RawMessage(`{"action":"screencast_stop"}`))
	text = contentText(t, out)
	if !strings.Contains(text, "Screencast stopped") {
		t.Fatalf("unexpected stop result: %s", text)
	}
	if !strings.Contains(text, ".mp4") {
		t.Fatalf("expected .mp4 path in stop message, got: %s", text)
	}
	t.Logf("Stop result: %s", text)

	// Verify MP4 file exists on disk.
	mp4Path := ScreencastDir + "/" + sessionID + ".mp4"
	info, err := os.Stat(mp4Path)
	if err != nil {
		t.Fatalf("MP4 file not found: %v", err)
	}
	if info.Size() == 0 {
		t.Fatal("MP4 file is empty")
	}
	t.Logf("MP4 file: %s (%d bytes)", mp4Path, info.Size())

	// An odd-sized viewport must yield an encodable, decodable MP4.
	if _, err := exec.LookPath("ffprobe"); err == nil {
		probe := exec.Command("ffprobe", "-v", "error", "-select_streams", "v:0",
			"-show_entries", "stream=width,height", "-of", "csv=p=0", mp4Path)
		dimensions, err := probe.CombinedOutput()
		if err != nil {
			t.Fatalf("ffprobe: %v: %s", err, dimensions)
		}
		var w, h int
		if _, err := fmt.Sscanf(string(dimensions), "%d,%d", &w, &h); err != nil || w%2 != 0 || h%2 != 0 {
			t.Fatalf("expected even video dimensions, got %q: %v", dimensions, err)
		}
	}

	// Double-stop should error.
	out = tool.Run(ctx, json.RawMessage(`{"action":"screencast_stop"}`))
	text = contentText(t, out)
	if !strings.Contains(text, "no active screencast") {
		t.Fatalf("expected no-active error, got: %s", text)
	}

	// Status should show inactive.
	active, _, _, _ = tools.screencastStatus()
	if active {
		t.Fatal("expected no active screencast after stop")
	}
}

// Exercise the actual FFmpeg command with odd frames and a mid-recording
// resize. Both CDP output formats must produce a playable, fixed-size MP4.
func TestScreencastFFmpegOddDimensions(t *testing.T) {
	for _, tool := range []string{"ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(tool); err != nil {
			t.Skipf("%s not installed", tool)
		}
	}
	for _, format := range []string{"png", "mjpeg"} {
		t.Run(format, func(t *testing.T) {
			var input bytes.Buffer
			for _, size := range []image.Point{{881, 495}, {880, 496}, {883, 497}} {
				frame := image.NewRGBA(image.Rect(0, 0, size.X, size.Y))
				var err error
				if format == "png" {
					err = png.Encode(&input, frame)
				} else {
					err = jpeg.Encode(&input, frame, &jpeg.Options{Quality: 80})
				}
				if err != nil {
					t.Fatal(err)
				}
			}
			mp4Path := filepath.Join(t.TempDir(), "recording.mp4")
			cmd := screencastFFmpegCommand(map[string]string{"png": "image2pipe", "mjpeg": "mjpeg"}[format], mp4Path)
			cmd.Stdin = &input
			if output, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("ffmpeg: %v: %s", err, output)
			}
			probe := exec.Command("ffprobe", "-v", "error", "-count_frames",
				"-select_streams", "v:0", "-show_entries", "stream=width,height,nb_read_frames",
				"-of", "csv=p=0", mp4Path)
			output, err := probe.CombinedOutput()
			if err != nil {
				t.Fatalf("ffprobe: %v: %s", err, output)
			}
			if got := strings.TrimSpace(string(output)); got != "882,496,3" {
				t.Fatalf("want three frames at fixed even dimensions, got %q", got)
			}
			decode := exec.Command("ffmpeg", "-nostdin", "-v", "error", "-i", mp4Path, "-f", "null", "-")
			if output, err := decode.CombinedOutput(); err != nil {
				t.Fatalf("decode MP4: %v: %s", err, output)
			}
		})
	}
}

func TestScreencastStopReportsEncoderFailure(t *testing.T) {
	path := filepath.Join(t.TempDir(), "recording.mp4")
	// A nonempty file must not mask a nonzero encoder exit.
	if err := os.WriteFile(path, []byte("partial recording"), 0o644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("sh", "-c", "echo encoder failed >&2; exit 1")
	cmd.Stderr = &limitedBuffer{max: 4096}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	b := &BrowseTools{screencast: screencastState{
		active: true, sessionID: "test", outputPath: path,
		encoder: &ffmpegEncoder{cmd: cmd}, startTime: time.Now(),
	}}
	_, _, _, _, err := b.screencastStop()
	if err == nil || !strings.Contains(err.Error(), "encoder failed") || !strings.Contains(err.Error(), path) {
		t.Fatalf("expected encoder failure with stderr and path, got %v", err)
	}
}

func TestScreencastKilledEncoderFailsStopTool(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping browser test in short mode")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()
	b := NewBrowseTools(ctx, 0)
	t.Cleanup(b.Close)
	tool := b.CombinedTool()
	out := tool.Run(ctx, json.RawMessage(`{"action":"screencast_start"}`))
	if out.Error != nil {
		if strings.Contains(out.Error.Error(), "failed to start browser") ||
			strings.Contains(out.Error.Error(), "failed to start ffmpeg") {
			t.Skip(out.Error)
		}
		t.Fatal(out.Error)
	}
	b.screencast.mu.Lock()
	process := b.screencast.encoder.(*ffmpegEncoder).cmd.Process
	b.screencast.mu.Unlock()
	if err := process.Kill(); err != nil {
		t.Fatal(err)
	}
	out = tool.Run(ctx, json.RawMessage(`{"action":"screencast_stop"}`))
	if out.Error == nil || !strings.Contains(out.Error.Error(), "ffmpeg failed") || out.Display != nil {
		t.Fatalf("expected tool error without playable MP4 display, got %+v", out)
	}
}

func TestScreencastConcurrentStopSharesFailure(t *testing.T) {
	path := filepath.Join(t.TempDir(), "recording.mp4")
	cmd := exec.Command("sh", "-c", "echo encoder failed >&2; exit 1")
	cmd.Stderr = &limitedBuffer{max: 4096}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	b := &BrowseTools{screencast: screencastState{
		active: true, sessionID: "test", outputPath: path,
		encoder: &ffmpegEncoder{cmd: cmd}, startTime: time.Now(),
	}}
	b.screencast.mu.Lock()
	resources := b.screencast.claimStopLocked()
	b.screencast.mu.Unlock()

	// One caller owns finalization; any other caller must see its result,
	// not mistake the already-inactive session for a successful stop.
	errCh := make(chan error, 1)
	go func() { errCh <- b.screencastStopInternal() }()
	err := b.finishScreencastStop(resources)
	if err == nil || !strings.Contains(err.Error(), "encoder failed") {
		t.Fatalf("expected encoder failure, got %v", err)
	}
	if otherErr := <-errCh; otherErr == nil || otherErr.Error() != err.Error() {
		t.Fatalf("concurrent stop got %v, want %v", otherErr, err)
	}
}

func TestScreencastStalledWriterTimesOut(t *testing.T) {
	// This child keeps stdin open but never reads it, so a large frame write
	// blocks until stop's deadline kills the child and breaks its pipe.
	cmd := exec.Command("sh", "-c", "exec sleep 60")
	in, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	})
	b := &BrowseTools{screencast: screencastState{
		active: true, sessionID: "test", encoder: &ffmpegEncoder{cmd: cmd, in: in},
		ffmpegIn: in, outputPath: filepath.Join(t.TempDir(), "recording.mp4"),
	}}
	b.screencast.mu.Lock()
	b.screencast.writers.Add(1)
	b.screencast.mu.Unlock()
	writeErr := make(chan error, 1)
	go func() {
		_, err := in.Write(make([]byte, 1<<20))
		b.screencast.writers.Done()
		writeErr <- err
	}()
	b.screencast.mu.Lock()
	resources := b.screencast.claimStopLocked()
	b.screencast.mu.Unlock()
	resources.timeout = 50 * time.Millisecond
	if err := b.finishScreencastStop(resources); err == nil {
		t.Fatal("expected timed-out encoder to fail")
	}
	if err := <-writeErr; err == nil {
		t.Fatal("expected blocked frame writer to be interrupted")
	}
}

func TestScreencastStopReportsMissingOutput(t *testing.T) {
	for _, createEmptyFile := range []bool{false, true} {
		t.Run(fmt.Sprint("empty=", createEmptyFile), func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "recording.mp4")
			if createEmptyFile {
				if err := os.WriteFile(path, nil, 0o644); err != nil {
					t.Fatal(err)
				}
			}
			cmd := exec.Command("sh", "-c", "exit 0")
			if err := cmd.Start(); err != nil {
				t.Fatal(err)
			}
			b := &BrowseTools{screencast: screencastState{
				active: true, sessionID: "test", outputPath: path,
				encoder: &ffmpegEncoder{cmd: cmd}, startTime: time.Now(),
			}}
			_, _, _, _, err := b.screencastStop()
			if err == nil || !strings.Contains(err.Error(), path) {
				t.Fatalf("expected missing/empty MP4 failure, got %v", err)
			}
		})
	}
}

func TestScreencastStderrRetainsLastError(t *testing.T) {
	lb := &limitedBuffer{max: 12}
	for _, part := range []string{"long banner\n", "actual error"} {
		if n, err := lb.Write([]byte(part)); err != nil || n != len(part) {
			t.Fatalf("write: n=%d err=%v", n, err)
		}
	}
	if got := lb.String(); got != "actual error" {
		t.Fatalf("stderr tail = %q", got)
	}
}

func TestScreencastLimitsAreReasonable(t *testing.T) {
	if ScreencastMaxFrames < 1000 {
		t.Fatalf("ScreencastMaxFrames too low: %d", ScreencastMaxFrames)
	}
	if ScreencastMaxDuration < 10*time.Minute {
		t.Fatalf("ScreencastMaxDuration too low: %v", ScreencastMaxDuration)
	}
}

func TestScreencastStatusWhenInactive(t *testing.T) {
	ctx := t.Context()
	tools := NewBrowseTools(ctx, 0)
	t.Cleanup(func() {
		tools.Close()
	})

	tool := tools.CombinedTool()
	out := tool.Run(ctx, json.RawMessage(`{"action":"screencast_status"}`))
	text := contentText(t, out)
	if !strings.Contains(text, "No active screencast") {
		t.Fatalf("expected no-active message, got: %s", text)
	}
}

func TestScreencastSchemaIncludes(t *testing.T) {
	tools := NewBrowseTools(t.Context(), 0)
	t.Cleanup(func() {
		tools.Close()
	})

	tool := tools.CombinedTool()
	var schema struct {
		Properties map[string]struct {
			Enum []string `json:"enum"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(tool.InputSchema, &schema); err != nil {
		t.Fatalf("failed to unmarshal schema: %v", err)
	}

	for _, action := range []string{"screencast_start", "screencast_stop", "screencast_status"} {
		found := false
		for _, a := range schema.Properties["action"].Enum {
			if a == action {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("action %q not in schema enum", action)
		}
	}

	for _, prop := range []string{"format", "quality", "max_width", "max_height", "every_nth_frame"} {
		if _, ok := schema.Properties[prop]; !ok {
			t.Errorf("expected property %q in schema", prop)
		}
	}
}

func TestScreencastSiblingActionsRunSequentially(t *testing.T) {
	tools := NewBrowseTools(t.Context(), 0)
	t.Cleanup(tools.Close)
	if !tools.CombinedTool().Sequential {
		t.Fatal("browser actions must run sequentially so sibling screencast_start/eval/screencast_stop calls stay ordered")
	}
}

// contentText extracts the text from a tool output, including errors.
func contentText(t *testing.T, out llm.ToolOut) string {
	t.Helper()
	if out.Error != nil {
		return out.Error.Error()
	}
	var parts []string
	for _, c := range out.LLMContent {
		if c.Text != "" {
			parts = append(parts, c.Text)
		}
	}
	return strings.Join(parts, "\n")
}

type fakeScreencastWriter struct {
	bytes.Buffer
	closed int
}

func (w *fakeScreencastWriter) Close() error {
	w.closed++
	return nil
}

type fakeScreencastEncoder struct {
	writer *fakeScreencastWriter
	waits  int
	stops  int
}

func (e *fakeScreencastEncoder) Stdin() io.WriteCloser { return e.writer }
func (e *fakeScreencastEncoder) Wait() error {
	e.waits++
	return nil
}
func (e *fakeScreencastEncoder) Stop() error {
	e.stops++
	return nil
}
func (e *fakeScreencastEncoder) Stderr() string { return "" }

func TestScreencastStartPublishesBeforeSynchronousFirstFrame(t *testing.T) {
	encoder := &fakeScreencastEncoder{writer: &fakeScreencastWriter{}}
	acks := make(chan int64, 1)
	var b *BrowseTools
	b = &BrowseTools{screencast: screencastState{
		newEncoder: func(_, _ string) (screencastEncoder, error) { return encoder, nil },
		startCDP: func(_ context.Context, _ page.ScreencastFormat, _, _, _, _ int64) error {
			b.handleScreencastFrame(&page.EventScreencastFrame{
				Data:      base64.StdEncoding.EncodeToString([]byte("frame")),
				SessionID: 17,
			})
			return nil
		},
		ackCDP:  func(_ context.Context, sessionID int64) error { acks <- sessionID; return nil },
		stopCDP: func(context.Context) error { return nil },
	}}
	if err := b.beginScreencastStart(); err != nil {
		t.Fatal(err)
	}
	if _, err := b.screencastStartWithContext(t.Context(), "jpeg", 60, 1280, 720, 1); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = b.screencastStopInternal() })

	b.screencast.mu.Lock()
	frames := b.screencast.frameCount
	b.screencast.mu.Unlock()
	if frames != 1 || encoder.writer.String() != "frame" {
		t.Fatalf("synchronous first frame was not recorded: frames=%d data=%q", frames, encoder.writer.String())
	}
	select {
	case got := <-acks:
		if got != 17 {
			t.Fatalf("ack = %d, want 17", got)
		}
	case <-t.Context().Done():
		t.Fatal("first frame was not acknowledged")
	}
}

func TestScreencastStartFailureRollsBackPublishedResources(t *testing.T) {
	encoder := &fakeScreencastEncoder{writer: &fakeScreencastWriter{}}
	var outputPath string
	b := &BrowseTools{screencast: screencastState{
		newEncoder: func(_, path string) (screencastEncoder, error) {
			outputPath = path
			if err := os.WriteFile(path, []byte("partial"), 0o644); err != nil {
				return nil, err
			}
			return encoder, nil
		},
		startCDP: func(context.Context, page.ScreencastFormat, int64, int64, int64, int64) error {
			return fmt.Errorf("CDP refused start")
		},
		stopCDP: func(context.Context) error { return nil },
	}}
	if err := b.beginScreencastStart(); err != nil {
		t.Fatal(err)
	}
	if _, err := b.screencastStartWithContext(t.Context(), "jpeg", 60, 1280, 720, 1); err == nil || !strings.Contains(err.Error(), "CDP refused start") {
		t.Fatalf("start error = %v", err)
	}
	if encoder.writer.closed != 1 || encoder.stops != 1 || encoder.waits != 1 {
		t.Fatalf("rollback close/stop/wait = %d/%d/%d, want 1/1/1", encoder.writer.closed, encoder.stops, encoder.waits)
	}
	if _, err := os.Stat(outputPath); !os.IsNotExist(err) {
		t.Fatalf("rollback left output %q: %v", outputPath, err)
	}
	b.screencast.mu.Lock()
	defer b.screencast.mu.Unlock()
	if b.screencast.active || b.screencast.starting || b.screencast.sessionID != "" || b.screencast.outputPath != "" || b.screencast.frameCount != 0 || !b.screencast.startTime.IsZero() || b.screencast.encoder != nil || b.screencast.ffmpegIn != nil || b.screencast.ackCh != nil || b.screencast.stopCh != nil || b.screencast.stopped != nil {
		t.Fatalf("rollback left published state: %+v", b.screencast)
	}
}

func TestScreencastStopWaitsForPublishedStart(t *testing.T) {
	encoder := &fakeScreencastEncoder{writer: &fakeScreencastWriter{}}
	startEntered := make(chan struct{})
	releaseStart := make(chan struct{})
	stopWaited := make(chan struct{})
	startResult := make(chan error, 1)
	stopResult := make(chan error, 1)
	b := &BrowseTools{screencast: screencastState{
		newEncoder: func(_, outputPath string) (screencastEncoder, error) {
			if err := os.WriteFile(outputPath, []byte("recording"), 0o644); err != nil {
				return nil, err
			}
			return encoder, nil
		},
		startCDP: func(context.Context, page.ScreencastFormat, int64, int64, int64, int64) error {
			close(startEntered)
			<-releaseStart
			return nil
		},
		stopCDP:   func(context.Context) error { return nil },
		startWait: func() { close(stopWaited) },
	}}
	if err := b.beginScreencastStart(); err != nil {
		t.Fatal(err)
	}
	go func() {
		_, err := b.screencastStartWithContext(t.Context(), "jpeg", 60, 1280, 720, 1)
		startResult <- err
	}()
	<-startEntered
	go func() { stopResult <- b.screencastStopInternal() }()
	select {
	case <-stopWaited:
	case err := <-stopResult:
		t.Fatalf("stop completed before the published start: %v", err)
	case <-t.Context().Done():
		t.Fatal("stop did not wait for the published start")
	}
	b.screencast.mu.Lock()
	if !b.screencast.active || b.screencast.stop != nil {
		b.screencast.mu.Unlock()
		t.Fatalf("stop claimed a starting screencast: %+v", b.screencast)
	}
	b.screencast.mu.Unlock()
	close(releaseStart)
	if err := <-startResult; err != nil {
		t.Fatal(err)
	}
	if err := <-stopResult; err != nil {
		t.Fatal(err)
	}
	if encoder.waits != 1 || encoder.stops != 0 {
		t.Fatalf("encoder finalized %d waits and %d stops, want one wait and no rollback stop", encoder.waits, encoder.stops)
	}
}

func TestScreencastNavigationRearmsActiveRecording(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	encoder := &fakeScreencastEncoder{writer: &fakeScreencastWriter{}}
	acks := make(chan int64, 1)
	rearmed := make(chan struct{}, 1)
	var b *BrowseTools
	starts := 0
	b = &BrowseTools{screencast: screencastState{
		newEncoder: func(_, _ string) (screencastEncoder, error) { return encoder, nil },
		startCDP: func(_ context.Context, format page.ScreencastFormat, quality, maxWidth, maxHeight, everyNthFrame int64) error {
			starts++
			if format != page.ScreencastFormatPng || quality != 71 || maxWidth != 901 || maxHeight != 509 || everyNthFrame != 3 {
				return fmt.Errorf("re-arm changed screencast settings")
			}
			if starts == 2 {
				b.handleScreencastFrame(&page.EventScreencastFrame{Data: base64.StdEncoding.EncodeToString([]byte("rearmed")), SessionID: 29})
				rearmed <- struct{}{}
			}
			return nil
		},
		ackCDP:  func(_ context.Context, id int64) error { acks <- id; return nil },
		stopCDP: func(context.Context) error { return nil },
	}}
	if err := b.beginScreencastStart(); err != nil {
		t.Fatal(err)
	}
	if _, err := b.screencastStartWithContext(ctx, "png", 71, 901, 509, 3); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = b.screencastStopInternal() })
	b.handleScreencastNavigation(&page.EventFrameNavigated{Frame: &cdp.Frame{ParentID: "subframe"}})
	b.handleScreencastNavigation(&page.EventFrameNavigated{Frame: &cdp.Frame{}})
	select {
	case <-rearmed:
	case <-ctx.Done():
		t.Fatal("top-level navigation did not re-arm the screencast")
	}
	if starts != 2 {
		t.Fatalf("start calls = %d, want 2", starts)
	}
	active, _, frames, _ := b.screencastStatus()
	if !active || frames != 1 {
		t.Fatalf("re-arm state active=%v frames=%d", active, frames)
	}
	select {
	case id := <-acks:
		if id != 29 {
			t.Fatalf("ack = %d, want 29", id)
		}
	case <-ctx.Done():
		t.Fatal("re-armed frame was not acknowledged")
	}
}

func TestScreencastNavigationIgnoresInactiveRecording(t *testing.T) {
	b := &BrowseTools{}
	b.handleScreencastNavigation(&page.EventFrameNavigated{Frame: &cdp.Frame{}})
	b.screencast.mu.Lock()
	defer b.screencast.mu.Unlock()
	if b.screencast.rearming || b.screencast.rearmDone != nil {
		t.Fatal("inactive recording scheduled a re-arm")
	}
}

func TestScreencastStopWaitsForNavigationRearm(t *testing.T) {
	encoder := &fakeScreencastEncoder{writer: &fakeScreencastWriter{}}
	rearmEntered := make(chan struct{})
	releaseRearm := make(chan struct{})
	stopWaited := make(chan struct{})
	stopResult := make(chan error, 1)
	starts := 0
	b := &BrowseTools{screencast: screencastState{
		newEncoder: func(_, path string) (screencastEncoder, error) {
			if err := os.WriteFile(path, []byte("recording"), 0o644); err != nil {
				return nil, err
			}
			return encoder, nil
		},
		startCDP: func(context.Context, page.ScreencastFormat, int64, int64, int64, int64) error {
			starts++
			if starts == 2 {
				close(rearmEntered)
				<-releaseRearm
			}
			return nil
		},
		stopCDP:   func(context.Context) error { return nil },
		startWait: func() { close(stopWaited) },
	}}
	if err := b.beginScreencastStart(); err != nil {
		t.Fatal(err)
	}
	if _, err := b.screencastStartWithContext(t.Context(), "jpeg", 60, 1280, 720, 1); err != nil {
		t.Fatal(err)
	}
	b.handleScreencastNavigation(&page.EventFrameNavigated{Frame: &cdp.Frame{}})
	<-rearmEntered
	go func() { stopResult <- b.screencastStopInternal() }()
	select {
	case <-stopWaited:
	case <-t.Context().Done():
		t.Fatal("stop did not wait for navigation re-arm")
	}
	b.screencast.mu.Lock()
	claimed := b.screencast.stop != nil || !b.screencast.active
	b.screencast.mu.Unlock()
	if claimed {
		t.Fatal("stop claimed a recording while re-arm was in progress")
	}
	close(releaseRearm)
	if err := <-stopResult; err != nil {
		t.Fatal(err)
	}
	if starts != 2 {
		t.Fatalf("start calls = %d, want 2", starts)
	}
}

func TestScreencastNavigationFailureIsReportedByStop(t *testing.T) {
	encoder := &fakeScreencastEncoder{writer: &fakeScreencastWriter{}}
	rearmEntered := make(chan struct{})
	releaseRearm := make(chan struct{})
	waited := make(chan struct{})
	stopResult := make(chan error, 1)
	starts := 0
	b := &BrowseTools{screencast: screencastState{
		newEncoder: func(_, path string) (screencastEncoder, error) {
			if err := os.WriteFile(path, []byte("recording"), 0o644); err != nil {
				return nil, err
			}
			return encoder, nil
		},
		startCDP: func(context.Context, page.ScreencastFormat, int64, int64, int64, int64) error {
			starts++
			if starts == 2 {
				close(rearmEntered)
				<-releaseRearm
				return fmt.Errorf("renderer gone")
			}
			return nil
		},
		stopCDP:   func(context.Context) error { return nil },
		startWait: func() { close(waited) },
	}}
	if err := b.beginScreencastStart(); err != nil {
		t.Fatal(err)
	}
	if _, err := b.screencastStartWithContext(t.Context(), "jpeg", 60, 1280, 720, 1); err != nil {
		t.Fatal(err)
	}
	b.handleScreencastNavigation(&page.EventFrameNavigated{Frame: &cdp.Frame{}})
	<-rearmEntered
	go func() { stopResult <- b.screencastStopInternal() }()
	select {
	case <-waited:
	case <-t.Context().Done():
		t.Fatal("stop did not wait for failed re-arm")
	}
	close(releaseRearm)
	if err := <-stopResult; err == nil || !strings.Contains(err.Error(), "re-arm screencast") || !strings.Contains(err.Error(), "renderer gone") {
		t.Fatalf("stop error = %v", err)
	}
}

func TestScreencastCloseWaitsForNavigationRearm(t *testing.T) {
	encoder := &fakeScreencastEncoder{writer: &fakeScreencastWriter{}}
	rearmEntered := make(chan struct{})
	releaseRearm := make(chan struct{})
	closeWaited := make(chan struct{})
	starts := 0
	b := &BrowseTools{screencast: screencastState{
		newEncoder: func(_, path string) (screencastEncoder, error) {
			if err := os.WriteFile(path, []byte("recording"), 0o644); err != nil {
				return nil, err
			}
			return encoder, nil
		},
		startCDP: func(context.Context, page.ScreencastFormat, int64, int64, int64, int64) error {
			starts++
			if starts == 2 {
				close(rearmEntered)
				<-releaseRearm
			}
			return nil
		},
		stopCDP:   func(context.Context) error { return nil },
		startWait: func() { close(closeWaited) },
	}}
	if err := b.beginScreencastStart(); err != nil {
		t.Fatal(err)
	}
	if _, err := b.screencastStartWithContext(t.Context(), "jpeg", 60, 1280, 720, 1); err != nil {
		t.Fatal(err)
	}
	b.handleScreencastNavigation(&page.EventFrameNavigated{Frame: &cdp.Frame{}})
	<-rearmEntered
	closed := make(chan struct{})
	go func() { b.Close(); close(closed) }()
	select {
	case <-closeWaited:
	case <-closed:
		close(releaseRearm)
		t.Fatal("Close completed before the navigation re-arm")
	case <-t.Context().Done():
		t.Fatal("Close did not wait for navigation re-arm")
	}
	b.screencast.mu.Lock()
	claimed := b.screencast.stop != nil || !b.screencast.active
	b.screencast.mu.Unlock()
	if claimed {
		t.Fatal("Close claimed a recording while re-arm was in progress")
	}
	close(releaseRearm)
	select {
	case <-closed:
	case <-t.Context().Done():
		t.Fatal("Close did not finish after re-arm")
	}
}
