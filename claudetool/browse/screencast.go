package browse

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
	"github.com/google/uuid"
)

// Screencast limits.
const (
	// ScreencastMaxFrames is the maximum number of frames before auto-stopping.
	ScreencastMaxFrames = 10000
	// ScreencastMaxDuration is the maximum duration before auto-stopping.
	ScreencastMaxDuration = 30 * time.Minute
	// screencastStopTimeout bounds finalization if ffmpeg stops reading stdin.
	screencastStopTimeout = 30 * time.Second
	// ScreencastDir is the directory where screencast output files are stored.
	ScreencastDir = "/tmp/shelley-screencasts"
)

// screencastState holds the state of an active screencast recording.
type screencastState struct {
	mu         sync.Mutex
	active     bool
	starting   bool // true while screencastStart is in progress (prevents TOCTOU)
	sessionID  string
	outputPath string
	frameCount int
	startTime  time.Time
	stopTimer  *time.Timer

	// encoder receives frames on stdin and produces the recording.
	encoder  screencastEncoder
	ffmpegIn io.WriteCloser
	writers  sync.WaitGroup // frame writes already in progress when stopping
	stop     *screencastStopResult

	// ackCh sends frame session IDs to the ack goroutine.
	ackCh chan int64
	// stopCh is closed to signal the ack goroutine to stop.
	stopCh chan struct{}
	// stopped is closed by the ack goroutine when it exits.
	stopped    chan struct{}
	startDone  chan struct{}
	rearmDone  chan struct{}
	rearming   bool
	generation uint64
	rearmErr   error
	config     screencastConfig
	browserCtx context.Context

	newEncoder screencastEncoderFactory
	startCDP   screencastStartCDP
	ackCDP     screencastAckCDP
	stopCDP    screencastStopCDP
	startWait  func()
}

type screencastEncoder interface {
	Stdin() io.WriteCloser
	Wait() error
	Stop() error
	Stderr() string
}

type ffmpegEncoder struct {
	cmd *exec.Cmd
	in  io.WriteCloser
}

func (e *ffmpegEncoder) Stdin() io.WriteCloser { return e.in }
func (e *ffmpegEncoder) Wait() error           { return e.cmd.Wait() }
func (e *ffmpegEncoder) Stop() error {
	if e.cmd.Process == nil {
		return nil
	}
	return e.cmd.Process.Kill()
}
func (e *ffmpegEncoder) Stderr() string {
	if lb, ok := e.cmd.Stderr.(*limitedBuffer); ok {
		return lb.String()
	}
	return ""
}

type screencastStartCDP func(context.Context, page.ScreencastFormat, int64, int64, int64, int64) error
type screencastAckCDP func(context.Context, int64) error
type screencastStopCDP func(context.Context) error
type screencastEncoderFactory func(string, string) (screencastEncoder, error)

type screencastConfig struct {
	format                                      page.ScreencastFormat
	quality, maxWidth, maxHeight, everyNthFrame int64
}

type screencastStopResult struct {
	done chan struct{}
	err  error // written before done is closed
}

type screencastStopResources struct {
	result     *screencastStopResult
	stopCh     chan struct{}
	stopped    chan struct{}
	ffmpegIn   io.WriteCloser
	encoder    screencastEncoder
	outputPath string
	rearmErr   error
	timeout    time.Duration
}

// handleScreencastFrame processes incoming screencast frame events.
// Called from handleBrowserEvent — must NOT call chromedp.Run (deadlock).
func (b *BrowseTools) handleScreencastFrame(e *page.EventScreencastFrame) {
	sc := &b.screencast
	sc.mu.Lock()
	if !sc.active {
		sc.mu.Unlock()
		return
	}

	// Check frame limit.
	if sc.frameCount >= ScreencastMaxFrames {
		log.Printf("screencast: max frames (%d) reached, will auto-stop", ScreencastMaxFrames)
		sc.mu.Unlock()
		// Full teardown in a goroutine (can't call chromedp.Run from here).
		go func() {
			if err := b.screencastStopInternal(); err != nil {
				log.Printf("screencast: auto-stop failed: %v", err)
			}
		}()
		return
	}

	sc.frameCount++
	ffmpegIn := sc.ffmpegIn
	ackCh := sc.ackCh
	sc.writers.Add(1)
	sc.mu.Unlock()
	defer sc.writers.Done()

	// Decode and pipe frame to ffmpeg outside the lock.
	data, err := base64.StdEncoding.DecodeString(e.Data)
	if err != nil {
		log.Printf("screencast: failed to decode frame: %v", err)
	} else if ffmpegIn != nil {
		if _, err := ffmpegIn.Write(data); err != nil {
			log.Printf("screencast: failed to write frame to ffmpeg: %v", err)
		}
	}

	// Send ack to background goroutine (non-blocking).
	select {
	case ackCh <- e.SessionID:
	default:
	}
}

// screencastAckLoop runs in a goroutine and acks screencast frames.
// It stops the CDP screencast and exits when stopCh is closed.
func (b *BrowseTools) screencastAckLoop(browserCtx context.Context, ackCh chan int64, stopCh, stopped chan struct{}) {
	defer close(stopped)
	for {
		select {
		case sessionID := <-ackCh:
			if err := b.screencastAck(browserCtx, sessionID); err != nil {
				log.Printf("screencast: failed to ack frame: %v", err)
			}
		case <-stopCh:
			// Drain any pending acks.
			for {
				select {
				case sessionID := <-ackCh:
					if err := b.screencastAck(browserCtx, sessionID); err != nil {
						log.Printf("screencast: failed to ack frame during drain: %v", err)
					}
				default:
					goto done
				}
			}
		}
	}
done:
	if err := b.screencastStopCDP(browserCtx); err != nil {
		log.Printf("screencast: failed to stop CDP screencast: %v", err)
	}
}

// screencastStart begins a screencast recording, piping frames into ffmpeg.
func (b *BrowseTools) screencastStart(format string, quality, maxWidth, maxHeight, everyNthFrame int64) (string, error) {
	if err := b.beginScreencastStart(); err != nil {
		return "", err
	}
	browserCtx, err := b.GetBrowserContext()
	if err != nil {
		b.clearScreencastStart()
		return "", err
	}
	return b.screencastStartWithContext(browserCtx, format, quality, maxWidth, maxHeight, everyNthFrame)
}

func (b *BrowseTools) beginScreencastStart() error {
	sc := &b.screencast
	sc.mu.Lock()
	defer sc.mu.Unlock()
	if sc.active || sc.starting {
		return fmt.Errorf("screencast is already active (session %s, %d frames so far) — stop it first", sc.sessionID, sc.frameCount)
	}
	if sc.stop != nil {
		select {
		case <-sc.stop.done:
			sc.stop = nil
		default:
			return fmt.Errorf("previous screencast is still stopping")
		}
	}
	sc.starting = true
	return nil
}

func (b *BrowseTools) screencastStartWithContext(browserCtx context.Context, format string, quality, maxWidth, maxHeight, everyNthFrame int64) (string, error) {
	sc := &b.screencast
	published := false
	defer func() {
		if !published {
			b.finishScreencastStart()
		}
	}()

	scFormat := page.ScreencastFormatJpeg
	inputFormat := "mjpeg"
	if format == "png" {
		scFormat = page.ScreencastFormatPng
		inputFormat = "image2pipe"
	}
	if quality <= 0 {
		quality = 60
	}
	if maxWidth <= 0 {
		maxWidth = 1280
	}
	if maxHeight <= 0 {
		maxHeight = 720
	}
	if everyNthFrame <= 0 {
		everyNthFrame = 1
	}

	sessionID := uuid.New().String()[:8]
	if err := os.MkdirAll(ScreencastDir, 0o755); err != nil {
		return "", fmt.Errorf("failed to create screencast dir: %w", err)
	}
	outputPath := filepath.Join(ScreencastDir, sessionID+".mp4")
	encoder, err := b.newScreencastEncoder(inputFormat, outputPath)
	if err != nil {
		return "", err
	}

	ackCh := make(chan int64, 4)
	stopCh := make(chan struct{})
	stoppedCh := make(chan struct{})
	startDone := make(chan struct{})
	sc.mu.Lock()
	sc.active = true
	sc.startDone = startDone
	sc.generation++
	sc.rearmErr = nil
	sc.config = screencastConfig{scFormat, quality, maxWidth, maxHeight, everyNthFrame}
	sc.browserCtx = browserCtx
	sc.sessionID = sessionID
	sc.outputPath = outputPath
	sc.frameCount = 0
	sc.startTime = time.Now()
	sc.encoder = encoder
	sc.ffmpegIn = encoder.Stdin()
	sc.ackCh = ackCh
	sc.stopCh = stopCh
	sc.stopped = stoppedCh
	sc.stopTimer = time.AfterFunc(ScreencastMaxDuration, func() {
		log.Printf("screencast: max duration (%v) reached, auto-stopping", ScreencastMaxDuration)
		if err := b.screencastStopInternal(); err != nil {
			log.Printf("screencast: auto-stop failed: %v", err)
		}
	})
	sc.mu.Unlock()
	go b.screencastAckLoop(browserCtx, ackCh, stopCh, stoppedCh)

	if err := b.screencastStartCDP(browserCtx, scFormat, quality, maxWidth, maxHeight, everyNthFrame); err != nil {
		published = true
		if cleanupErr := b.rollbackScreencastStart(); cleanupErr != nil {
			return "", fmt.Errorf("failed to start screencast: %w", errors.Join(err, cleanupErr))
		}
		return "", fmt.Errorf("failed to start screencast: %w", err)
	}
	published = true
	b.finishScreencastStart()
	return sessionID, nil
}

func (b *BrowseTools) finishScreencastStart() {
	sc := &b.screencast
	sc.mu.Lock()
	done := sc.startDone
	sc.startDone = nil
	sc.starting = false
	sc.mu.Unlock()
	if done != nil {
		close(done)
	}
}

func (b *BrowseTools) rollbackScreencastStart() error {
	sc := &b.screencast
	sc.mu.Lock()
	resources := &screencastStopResources{
		stopCh: sc.stopCh, stopped: sc.stopped, ffmpegIn: sc.ffmpegIn,
		encoder: sc.encoder, outputPath: sc.outputPath,
	}
	if sc.stopTimer != nil {
		sc.stopTimer.Stop()
		sc.stopTimer = nil
	}
	// Keep starting true until the encoder and all claimed writers are gone.
	// Concurrent stops wait on startDone instead of claiming these resources.
	sc.active = false
	sc.mu.Unlock()

	if resources.stopCh != nil {
		close(resources.stopCh)
	}
	if resources.stopped != nil {
		<-resources.stopped
	}
	var cleanup []error
	if resources.encoder != nil {
		if err := resources.encoder.Stop(); err != nil {
			cleanup = append(cleanup, fmt.Errorf("stop screencast encoder: %w", err))
		}
	}
	sc.writers.Wait()
	if resources.ffmpegIn != nil {
		if err := resources.ffmpegIn.Close(); err != nil {
			cleanup = append(cleanup, fmt.Errorf("close screencast encoder input: %w", err))
		}
	}
	if resources.encoder != nil {
		if err := resources.encoder.Wait(); err != nil {
			cleanup = append(cleanup, fmt.Errorf("wait for screencast encoder: %w", err))
		}
	}
	if resources.outputPath != "" {
		if err := os.Remove(resources.outputPath); err != nil && !os.IsNotExist(err) {
			cleanup = append(cleanup, fmt.Errorf("remove screencast output: %w", err))
		}
	}

	sc.mu.Lock()
	sc.sessionID = ""
	sc.outputPath = ""
	sc.frameCount = 0
	sc.startTime = time.Time{}
	sc.encoder = nil
	sc.ffmpegIn = nil
	sc.ackCh = nil
	sc.stopCh = nil
	sc.stopped = nil
	sc.rearmErr = nil
	sc.config = screencastConfig{}
	sc.browserCtx = nil
	sc.mu.Unlock()
	b.finishScreencastStart()
	return errors.Join(cleanup...)
}

func (b *BrowseTools) clearScreencastStart() { b.finishScreencastStart() }

func (b *BrowseTools) newScreencastEncoder(inputFormat, outputPath string) (screencastEncoder, error) {
	if factory := b.screencast.newEncoder; factory != nil {
		return factory(inputFormat, outputPath)
	}
	cmd := screencastFFmpegCommand(inputFormat, outputPath)
	in, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create ffmpeg stdin pipe: %w", err)
	}
	cmd.Stderr = &limitedBuffer{max: 4096}
	if err := cmd.Start(); err != nil {
		_ = in.Close()
		return nil, fmt.Errorf("failed to start ffmpeg (is it installed?): %w", err)
	}
	return &ffmpegEncoder{cmd: cmd, in: in}, nil
}

func (b *BrowseTools) screencastStartCDP(ctx context.Context, format page.ScreencastFormat, quality, maxWidth, maxHeight, everyNthFrame int64) error {
	if start := b.screencast.startCDP; start != nil {
		return start(ctx, format, quality, maxWidth, maxHeight, everyNthFrame)
	}
	return chromedp.Run(ctx, page.StartScreencast().WithFormat(format).WithQuality(quality).WithMaxWidth(maxWidth).WithMaxHeight(maxHeight).WithEveryNthFrame(everyNthFrame))
}
func (b *BrowseTools) screencastAck(ctx context.Context, sessionID int64) error {
	if ack := b.screencast.ackCDP; ack != nil {
		return ack(ctx, sessionID)
	}
	return chromedp.Run(ctx, page.ScreencastFrameAck(sessionID))
}
func (b *BrowseTools) screencastStopCDP(ctx context.Context) error {
	if stop := b.screencast.stopCDP; stop != nil {
		return stop(ctx)
	}
	return chromedp.Run(ctx, page.StopScreencast())
}

// handleScreencastNavigation re-arms Page.startScreencast after a top-level
// navigation replaces the renderer that owned the prior stream.
func (b *BrowseTools) handleScreencastNavigation(e *page.EventFrameNavigated) {
	if e == nil || e.Frame == nil || e.Frame.ParentID != "" {
		return
	}
	sc := &b.screencast
	sc.mu.Lock()
	if !sc.active || sc.rearming {
		sc.mu.Unlock()
		return
	}
	generation, config, browserCtx := sc.generation, sc.config, sc.browserCtx
	sc.rearming = true
	sc.rearmDone = make(chan struct{})
	sc.mu.Unlock()
	go b.rearmScreencast(browserCtx, generation, config)
}

func (b *BrowseTools) rearmScreencast(browserCtx context.Context, generation uint64, config screencastConfig) {
	b.waitForScreencastInitialStart()
	err := error(nil)
	if browserCtx == nil {
		err = fmt.Errorf("screencast browser context is unavailable")
	} else {
		sc := &b.screencast
		sc.mu.Lock()
		active := sc.active && sc.rearming && sc.generation == generation
		sc.mu.Unlock()
		if active {
			if err = b.screencastStopCDP(browserCtx); err == nil {
				err = b.screencastStartCDP(browserCtx, config.format, config.quality, config.maxWidth, config.maxHeight, config.everyNthFrame)
			}
		}
	}

	sc := &b.screencast
	sc.mu.Lock()
	if sc.rearming && sc.generation == generation {
		if err != nil {
			sc.rearmErr = fmt.Errorf("re-arm screencast after navigation: %w", err)
		}
		done := sc.rearmDone
		sc.rearming = false
		sc.rearmDone = nil
		sc.mu.Unlock()
		close(done)
		return
	}
	sc.mu.Unlock()
}

// screencastFFmpegCommand encodes CDP's JPEG or PNG frames as H.264 MP4.
func screencastFFmpegCommand(inputFormat, outputPath string) *exec.Cmd {
	return exec.Command(
		"ffmpeg",
		"-nostdin",
		"-hide_banner",
		"-loglevel", "error",
		"-y",
		"-f", inputFormat,
		"-framerate", "4",
		"-i", "pipe:0",
		// yuv420p requires even dimensions. Padding preserves every source
		// pixel (unlike cropping). FFmpeg's default autoscale keeps the
		// output size fixed if the viewport changes mid-recording.
		"-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0",
		"-c:v", "libx264",
		"-pix_fmt", "yuv420p",
		"-preset", "fast",
		"-abort_on", "empty_output",
		"-movflags", "+faststart",
		outputPath,
	)
}

// claimStopLocked assigns one caller the teardown. Caller must hold sc.mu.
func (sc *screencastState) claimStopLocked() *screencastStopResources {
	result := &screencastStopResult{done: make(chan struct{})}
	sc.stop = result
	sc.active = false
	if sc.stopTimer != nil {
		sc.stopTimer.Stop()
		sc.stopTimer = nil
	}
	resources := &screencastStopResources{
		result: result, stopCh: sc.stopCh, stopped: sc.stopped,
		ffmpegIn: sc.ffmpegIn, encoder: sc.encoder, outputPath: sc.outputPath,
		rearmErr: sc.rearmErr, timeout: screencastStopTimeout,
	}
	sc.stopCh = nil
	sc.ffmpegIn = nil
	sc.encoder = nil
	return resources
}

func (b *BrowseTools) waitForScreencastInitialStart() {
	sc := &b.screencast
	sc.mu.Lock()
	done := sc.startDone
	starting := sc.starting
	sc.mu.Unlock()
	if starting && done != nil {
		if wait := sc.startWait; wait != nil {
			wait()
		}
		<-done
	}
}

func (b *BrowseTools) waitForScreencastStart() {
	for {
		sc := &b.screencast
		sc.mu.Lock()
		startDone, rearmDone := sc.startDone, sc.rearmDone
		starting, rearming := sc.starting, sc.rearming
		sc.mu.Unlock()
		if starting && startDone != nil {
			if wait := sc.startWait; wait != nil {
				wait()
			}
			<-startDone
			continue
		}
		if rearming && rearmDone != nil {
			if wait := sc.startWait; wait != nil {
				wait()
			}
			<-rearmDone
			continue
		}
		return
	}
}

// screencastStopInternal stops the screencast, or waits for an in-progress
// stop to finish. Safe to call from any goroutine.
func (b *BrowseTools) screencastStopInternal() error {
	b.waitForScreencastStart()
	sc := &b.screencast
	sc.mu.Lock()
	var resources *screencastStopResources
	if sc.active {
		resources = sc.claimStopLocked()
	}
	result := sc.stop
	sc.mu.Unlock()
	if resources != nil {
		return b.finishScreencastStop(resources)
	}
	if result != nil {
		<-result.done
		return result.err
	}
	return nil
}

func (b *BrowseTools) finishScreencastStop(resources *screencastStopResources) (err error) {
	defer func() {
		resources.result.err = err
		close(resources.result.done)
	}()
	// A stalled encoder can block a frame writer forever. Killing this
	// recording's ffmpeg process closes the pipe and makes stop report an
	// error instead of hanging the tool (or browser shutdown).
	timer := time.AfterFunc(resources.timeout, func() {
		if resources.encoder != nil {
			if err := resources.encoder.Stop(); err == nil {
				log.Printf("screencast: ffmpeg did not finish within %v; killed encoder", resources.timeout)
			}
		}
	})
	defer timer.Stop()

	// Signal the ack goroutine to stop.
	if resources.stopCh != nil {
		close(resources.stopCh)
	}
	if resources.stopped != nil {
		<-resources.stopped
	}

	// Finish any frame writes claimed before active was cleared, then
	// signal EOF and wait for the MP4 to be finalized.
	b.screencast.writers.Wait()
	if resources.ffmpegIn != nil {
		resources.ffmpegIn.Close()
	}
	if resources.encoder != nil {
		if err := resources.encoder.Wait(); err != nil {
			return fmt.Errorf("ffmpeg failed: %w: %s", err, resources.encoder.Stderr())
		}
	}
	if resources.rearmErr != nil {
		return resources.rearmErr
	}
	info, err := os.Stat(resources.outputPath)
	if err != nil {
		return fmt.Errorf("screencast output %s: %w", resources.outputPath, err)
	}
	if !info.Mode().IsRegular() || info.Size() == 0 {
		return fmt.Errorf("screencast output %s is not a nonempty regular file", resources.outputPath)
	}
	return nil
}

// screencastStop stops the screencast and returns summary info.
func (b *BrowseTools) screencastStop() (sessionID, outputPath string, frameCount int, duration time.Duration, err error) {
	b.waitForScreencastStart()
	sc := &b.screencast
	sc.mu.Lock()
	if !sc.active {
		sc.mu.Unlock()
		return "", "", 0, 0, fmt.Errorf("no active screencast — call screencast_start first")
	}
	sessionID = sc.sessionID
	outputPath = sc.outputPath
	frameCount = sc.frameCount
	duration = time.Since(sc.startTime)
	resources := sc.claimStopLocked()
	sc.mu.Unlock()

	if err := b.finishScreencastStop(resources); err != nil {
		return sessionID, outputPath, frameCount, duration, fmt.Errorf("screencast %s failed after %d frames (MP4 at %s): %w", sessionID, frameCount, outputPath, err)
	}
	return sessionID, outputPath, frameCount, duration, nil
}

// screencastStatus returns the current status of the screencast.
func (b *BrowseTools) screencastStatus() (active bool, sessionID string, frameCount int, elapsed time.Duration) {
	sc := &b.screencast
	sc.mu.Lock()
	defer sc.mu.Unlock()
	if !sc.active {
		return false, "", 0, 0
	}
	return true, sc.sessionID, sc.frameCount, time.Since(sc.startTime)
}

// limitedBuffer keeps the end of ffmpeg's stderr, where the failure is reported.
type limitedBuffer struct {
	buf []byte
	max int
}

func (lb *limitedBuffer) Write(p []byte) (int, error) {
	n := len(p)
	if n >= lb.max {
		lb.buf = append(lb.buf[:0], p[n-lb.max:]...)
	} else {
		if drop := len(lb.buf) + n - lb.max; drop > 0 {
			lb.buf = lb.buf[drop:]
		}
		lb.buf = append(lb.buf, p...)
	}
	// Always report full length consumed so ffmpeg doesn't get write errors.
	return n, nil
}

func (lb *limitedBuffer) String() string {
	return string(lb.buf)
}
