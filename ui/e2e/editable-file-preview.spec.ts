import { expect, test } from "@playwright/test";
import { createConversationViaAPI } from "./helpers";

// VaxTui's Ctrl/Cmd+P intentionally opens WorkspaceEditor rather than the
// legacy per-file modal. EditableFileModal remains a real product surface for
// the private test HOME's User AGENTS.md (and distillation messages), so test
// it through that accessible entry rather than pretending picker rows open it.
test("Edit User AGENTS.md previews, returns focus, and saves in the private test HOME", async ({
  page,
  request,
}) => {
  const browserErrors: string[] = [];
  const writeFailures: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("response", async (response) => {
    if (response.url().includes("/api/write-file") && !response.ok()) {
      writeFailures.push(`${response.status()}: ${await response.text()}`);
    }
  });
  const slug = await createConversationViaAPI(request, "Hello");
  await page.goto(`/c/${slug}`);
  await page.locator(".chat-overflow-menu-wrapper .btn-icon").click();
  await page
    .locator(".overflow-menu-item")
    .filter({ hasText: /Edit User AGENTS\.md/ })
    .click();

  const modal = page.getByRole("dialog", { name: "Edit AGENTS.md" });
  await expect(modal.locator(".monaco-editor")).toBeVisible();
  await expect(modal.getByRole("button", { name: "Comment mode" })).toHaveCount(0);
  await modal.getByRole("button", { name: "Preview mode" }).click();
  const preview = modal.getByRole("region", { name: "Markdown preview" });
  await expect(preview).toBeVisible();
  await expect(preview).toBeFocused();
  await page.keyboard.press("ControlOrMeta+Alt+P");
  await expect(modal.locator(".monaco-editor")).toBeVisible();

  const editorInput = modal.locator(".monaco-editor textarea.inputarea");
  await editorInput.focus();
  await expect(editorInput).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type("\n<!-- private E2E save -->");
  try {
    await expect(modal.locator(".agents-md-save-saved")).toHaveText("Saved");
  } catch (error) {
    throw new Error(`EditableFileModal did not save; browser errors: ${browserErrors.join(" | ")}; write failures: ${writeFailures.join(" | ")}`, {
      cause: error,
    });
  }
});

test("User AGENTS preview uses the live unsaved buffer and safe Markdown renderer", async ({ page, request }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => ((window as unknown as { copied?: string }).copied = text) },
    });
    (window as unknown as { previewExecuted?: boolean }).previewExecuted = false;
  });
  await page.route("**/api/user-agents-md", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        path: "/private/test-home/.config/shelley/AGENTS.md",
        content: "# Safe AGENTS\n\n| Rule | State |\n| --- | --- |\n| Preview | Ready |\n\n```ts\nconst safe = true;\n```\n\n<img src=x onerror=\"window.previewExecuted=true\">\n<script>window.previewExecuted=true</script>",
      }),
    }),
  );
  const slug = await createConversationViaAPI(request, "Hello");
  await page.goto(`/c/${slug}`);
  await page.locator(".chat-overflow-menu-wrapper .btn-icon").click();
  await page.locator(".overflow-menu-item").filter({ hasText: /Edit User AGENTS\.md/ }).click();
  const modal = page.getByRole("dialog", { name: "Edit AGENTS.md" });
  await expect(modal.locator(".monaco-editor")).toBeVisible();
  await modal.getByRole("button", { name: "Preview mode" }).click();
  const preview = modal.getByRole("region", { name: "Markdown preview" });
  await expect(preview.getByRole("heading", { name: "Safe AGENTS" })).toBeVisible();
  await expect(preview.getByRole("table").getByRole("cell", { name: "Ready" })).toBeVisible();
  await expect(preview.locator("script, img, [onerror]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { previewExecuted?: boolean }).previewExecuted)).toBe(false);
  await preview.locator(".shelley-code-copy").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { copied?: string }).copied)).toContain("const safe = true");
  await modal.getByRole("button", { name: "Edit mode" }).click();
  const input = modal.locator(".monaco-editor textarea.inputarea");
  await input.focus();
  await page.keyboard.press("End");
  await page.keyboard.type("\n## Unsaved preview");
  await modal.getByRole("button", { name: "Preview mode" }).click();
  await expect(preview.getByRole("heading", { name: "Unsaved preview" })).toBeVisible();
});

test("User AGENTS keeps a failed edited buffer after reopen and retries it", async ({ page, request }) => {
  let failWrite = true;
  await page.route("**/api/write-file", async (route) => {
    if (failWrite) await route.fulfill({ status: 503, body: "temporary write failure" });
    else await route.continue();
  });
  const slug = await createConversationViaAPI(request, "Hello");
  await page.goto(`/c/${slug}`);
  const open = async () => {
    await page.locator(".chat-overflow-menu-wrapper .btn-icon").click();
    await page.locator(".overflow-menu-item").filter({ hasText: /Edit User AGENTS\.md/ }).click();
    const dialog = page.getByRole("dialog", { name: "Edit AGENTS.md" });
    await expect(dialog.locator(".monaco-editor")).toBeVisible();
    return dialog;
  };
  let modal = await open();
  const input = modal.locator(".monaco-editor textarea.inputarea");
  await input.focus();
  await page.keyboard.press("End");
  await page.keyboard.type("\n<!-- retain after failed save -->");
  await page.keyboard.press("ControlOrMeta+S");
  await expect(modal.locator(".agents-md-save-error")).toBeVisible();
  await modal.getByRole("button", { name: "Close (Esc)" }).click();
  modal = await open();
  await expect(modal.locator(".view-lines")).toContainText("retain after failed save");
  await expect(modal.locator(".agents-md-save-error")).toBeVisible();
  failWrite = false;
  const retriedInput = modal.locator(".monaco-editor textarea.inputarea");
  await retriedInput.focus();
  // Monaco registers save commands after recreating the editor. Make a real
  // edit before invoking it so this also verifies the recovered buffer remains editable.
  await page.keyboard.press("End");
  await page.keyboard.type(" ");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("ControlOrMeta+S");
  await expect(modal.locator(".agents-md-save-saved")).toHaveText("Saved");
});
