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
  // Escape from the output log follows the actual forward focus destination
  // outside the panel; do not assume that it is always the composer.
  const escapeTarget = `terminal-escape-target-${Date.now()}`;
  const hasForwardTarget = await page.evaluate((target) => {
    const panel = document.querySelector(".terminal-panel");
    if (!panel) return false;
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      ),
    ).filter((element) => element.offsetParent !== null || element === document.activeElement);
    const next = candidates.find(
      (element) =>
        !panel.contains(element) &&
        !!(panel.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
    if (!next) return false;
    next.setAttribute("data-terminal-escape-target", target);
    return true;
  }, escapeTarget);
  await log.press("Escape");
  if (hasForwardTarget) {
    await expect(page.locator(`[data-terminal-escape-target="${escapeTarget}"]`)).toBeFocused();
  } else {
    await expect(page.getByTestId("message-input")).toBeFocused();
  }

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

  // Cmd+A stays inside xterm: it clears an existing document selection instead
  // of selecting the entire Shelley page.
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(".chat-interface") ?? document.body);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await shellInput.focus();
  await page.keyboard.press("Meta+a");
  await expect(shellInput).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.rangeCount ?? 0)).toBe(0);
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
  await page.clock.install({ time: new Date("2026-10-02T12:00:00Z") });
  const terminal = await openTerminal(page, request);
  const shellInput = terminal.locator(".xterm-helper-textarea");
  const log = terminal.getByRole("log", { name: /terminal output/i });
  await shellInput.focus();
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
    await page.clock.fastForward(900);
    await expect(log).toContainText(marker);
  }

  const announcer = page.getByTestId("status-announcer");
  await expect(announcer).toHaveText(/Terminal live output paused after 20 seconds/);
  await page.keyboard.press("Escape");
  await expect(announcer).toHaveText("Terminal live output resumed.");
});
