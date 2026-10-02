import { expect, test } from "@playwright/test";
import {
  createConversationViaAPIWithDetails,
  selectWorkspace,
  testWorkingDirectory,
} from "./helpers";

async function openTerminal(
  page: Parameters<typeof selectWorkspace>[0],
  request: Parameters<typeof selectWorkspace>[1],
) {
  const { conversationId } = await createConversationViaAPIWithDetails(
    request,
    "terminal accessibility test",
  );
  await page.goto(`/c/${conversationId}`);
  const tabs = page.locator(".terminal-panel-tab");
  const existingTabs = await tabs.count();
  await page.locator(".chat-overflow-menu-wrapper .btn-icon").click();
  await page.locator(".overflow-menu-item", { hasText: /terminal/i }).click();
  await expect(tabs).toHaveCount(existingTabs + 1);
  const terminal = page
    .locator(".terminal-panel-content [data-terminal-id]")
    .filter({ visible: true });
  await expect(terminal).toBeVisible();
  return terminal;
}

test("spawns a workspace-scoped terminal and exposes its output as a keyboard-readable log", async ({
  page,
  request,
}) => {
  await selectWorkspace(page, request, testWorkingDirectory());
  const socketURLs: string[] = [];
  page.on("websocket", (socket) => socketURLs.push(socket.url()));

  const terminal = await openTerminal(page, request);
  await expect(terminal.getByRole("log", { name: /terminal output/i })).toBeVisible();
  // Other suite conversations can have restored terminals, whose sockets only
  // reattach by term_id. This panel action must add a fresh terminal spawn.
  await expect
    .poll(
      () => socketURLs.find((url) => url.includes("/api/exec-ws") && url.includes("cmd=")) ?? "",
    )
    .toContain("workspace_id=");

  const log = terminal.getByRole("log", { name: /terminal output/i });
  await log.focus();
  await expect(log).toBeFocused();
  // Supply a real focusable after the panel. Escape must take the output log
  // forward to it, which exercises the production focus walk without assuming
  // that the hidden Chat composer follows the Workbench panel in document order.
  const escapeTarget = `terminal-escape-target-${Date.now()}`;
  await page.evaluate((target) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Terminal escape target";
    button.setAttribute("data-terminal-escape-target", target);
    document.body.append(button);
  }, escapeTarget);
  await log.press("Escape");
  const target = page.locator(`[data-terminal-escape-target="${escapeTarget}"]`);
  await expect(target).toBeFocused();
  await target.evaluate((element) => element.remove());

  await log.focus();
  await log.press("Tab");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.className ?? ""))
    .toContain("xterm-helper-textarea");
});

test("keeps terminal control-I completion on the shell input", async ({ page, request }) => {
  const sentFrames: string[] = [];
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/api/exec-ws")) return;
    socket.on("framesent", (event) => {
      if (typeof event.payload === "string") sentFrames.push(event.payload);
    });
  });

  const terminal = await openTerminal(page, request);
  const shellInput = terminal.locator(".xterm-helper-textarea");
  await expect(shellInput).toBeVisible();
  await shellInput.focus();
  await page.keyboard.press("Control+i");
  await expect.poll(() => sentFrames.some((frame) => frame.includes('"data":"\\t"'))).toBeTruthy();

  // Cmd+A replaces a selected external node with xterm's own selection. Its
  // range must stay in this terminal rather than leaking to Chat/sidebar text.
  await page.evaluate(() => {
    const sentinel = document.createElement("span");
    sentinel.textContent = "EXTERNAL_CMD_A_SENTINEL";
    sentinel.setAttribute("data-terminal-cmd-a-sentinel", "true");
    document.body.append(sentinel);
    const range = document.createRange();
    range.selectNodeContents(sentinel);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await shellInput.focus();
  await page.keyboard.press("Meta+a");
  await expect(shellInput).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return true;
        const parent = (node: Node | null) =>
          node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
        return (
          !selection.toString().includes("EXTERNAL_CMD_A_SENTINEL") &&
          !!parent(selection.anchorNode)?.closest(".terminal-instance") &&
          !!parent(selection.focusNode)?.closest(".terminal-instance")
        );
      }),
    )
    .toBeTruthy();
});

function receivedOutputContains(frames: string[], marker: string) {
  return frames.some((frame) => {
    try {
      const message = JSON.parse(frame) as { type?: string; data?: string };
      return (
        message.type === "output" &&
        typeof message.data === "string" &&
        Buffer.from(message.data, "base64").toString().includes(marker)
      );
    } catch {
      return false;
    }
  });
}

test("pauses capped terminal live output and resumes it with Escape", async ({ page, request }) => {
  // Fake browser time keeps this behavioral cap regression quick without a sleep;
  // output still comes from an actual private terminal PTY over its websocket.
  const receivedFrames: string[] = [];
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/api/exec-ws")) return;
    socket.on("framereceived", (event) => {
      if (typeof event.payload === "string") receivedFrames.push(event.payload);
    });
  });
  const terminal = await openTerminal(page, request);
  const shellInput = terminal.locator(".xterm-helper-textarea");
  const log = terminal.getByRole("log", { name: /terminal output/i });
  await page.clock.install({ time: new Date() });
  // pauseAt must be future relative to the emulated clock, which may tick
  // between protocol calls before it is frozen.
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  await page.evaluate(() => {
    const announcements: string[] = [];
    window.addEventListener("shelley:a11y-announce", (event) => {
      announcements.push((event as CustomEvent<{ text: string }>).detail.text);
    });
    (window as Window & { terminalAnnouncements?: string[] }).terminalAnnouncements = announcements;
  });
  // Reset any native-time output window created while the terminal mounted:
  // log focus blurs xterm (clearing it), then shell focus starts a fake-time one.
  await log.focus();
  await expect(log).toBeFocused();
  await shellInput.focus();
  await expect(shellInput).toBeFocused();
  // A bounded shell loop gives each fake-time step a real websocket output
  // within the helper's one-second idle window. Unlike `yes`, it cannot flood
  // the PTY or outlive this private test terminal.
  await page.keyboard.type("while IFS= read -r line; do printf '%s\n' \"$line\"; done");
  await page.keyboard.press("Enter");
  for (let elapsed = 0; elapsed < 20_000; elapsed += 900) {
    const marker = `TERMINAL_A11Y_LIVE_${elapsed}`;
    await page.keyboard.type(marker);
    await page.keyboard.press("Enter");
    await expect.poll(() => receivedOutputContains(receivedFrames, marker)).toBeTruthy();
    // Flush the xterm write/mirror first: a websocket observer only proves the
    // frame reached Chromium, not that TerminalInstance recorded its timestamp.
    await page.clock.fastForward(80);
    await expect(log).toContainText(marker);
    await page.clock.fastForward(820);
  }

  const announcements = () =>
    page.evaluate(
      () => (window as Window & { terminalAnnouncements?: string[] }).terminalAnnouncements ?? [],
    );
  await expect
    .poll(announcements)
    .toContainEqual(expect.stringMatching(/Terminal live output paused after 20 seconds/));
  await page.keyboard.press("Escape");
  await expect.poll(announcements).toContain("Terminal live output resumed.");
});
