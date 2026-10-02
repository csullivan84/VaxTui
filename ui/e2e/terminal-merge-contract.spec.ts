import { expect, test } from "@playwright/test";
import { createConversationViaAPIWithDetails, selectWorkspace, testWorkingDirectory } from "./helpers";

async function openTerminal(page: Parameters<typeof selectWorkspace>[0], request: Parameters<typeof selectWorkspace>[1]) {
  const { conversationId } = await createConversationViaAPIWithDetails(request, "terminal accessibility test");
  await page.goto(`/c/${conversationId}`);
  await page.locator(".chat-overflow-menu-wrapper .btn-icon").click();
  await page.locator(".overflow-menu-item", { hasText: /terminal/i }).click();
  const terminal = page.locator(".terminal-panel-content [data-terminal-id]").filter({ visible: true });
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
  await expect.poll(() => socketURLs.find((url) => url.includes("/api/exec-ws")) ?? "").toContain("workspace_id=");

  const log = terminal.getByRole("log", { name: /terminal output/i });
  await log.focus();
  await expect(log).toBeFocused();
  // Escape from the output log must leave the terminal for the intended composer,
  // rather than merely proving that Tab already moved focus away from the log.
  await log.press("Escape");
  await expect(page.getByTestId("message-input")).toBeFocused();

  await log.focus();
  await log.press("Tab");
  await expect.poll(() => page.evaluate(() => document.activeElement?.className ?? "")).toContain("xterm-helper-textarea");
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
});
