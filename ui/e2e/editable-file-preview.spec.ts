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
