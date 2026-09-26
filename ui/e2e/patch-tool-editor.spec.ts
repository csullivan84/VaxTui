import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createConversationViaAPI, disableScreenReaderMode, withTempDir } from "./helpers";

// A patch tool card's header offers "open in editor": it opens the patched
// file in the workspace's Workbench editor (where the fuzzy finder opens files
// too), so a patch can be inspected/fixed in place without hunting for the path.

/** The Workbench file editor, asserted to have `path` open in its active tab. */
async function expectFileInEditor(page: Page, path: string) {
  await expect(page.getByRole("tab", { name: "Workbench", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const editor = page.getByRole("region", { name: "File editor" });
  await expect(editor).toBeVisible({ timeout: 15000 });
  await expect(editor.locator(`[role="tab"][title="${path}"]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  return editor;
}

test.describe("Patch tool open-in-editor", () => {
  test("header button opens the patched file in the editor", async ({ page, request }) => {
    test.setTimeout(60000);

    await withTempDir("shelley-patchedit-", async (dir) => {
      const filePath = join(dir, "notes.txt");
      writeFileSync(filePath, "an example line\n");

      // The predictable model's "patch: <path>" replaces "example" in that file.
      const slug = await createConversationViaAPI(request, `patch: ${filePath}`, { cwd: dir });
      expect(readFileSync(filePath, "utf8")).toContain("updated example");

      await page.goto(`/c/${slug}`);
      await page.waitForLoadState("domcontentloaded");

      const patchTool = page.locator('.patch-tool[data-testid="tool-call-completed"]').first();
      await expect(patchTool).toBeVisible({ timeout: 15000 });

      await patchTool.getByRole("button", { name: "Open in editor" }).click();

      const editor = await expectFileInEditor(page, filePath);
      await expect(editor.locator(".view-line", { hasText: "updated example" }).first()).toBeVisible(
        { timeout: 15000 },
      );

      // Returning to the chat leaves the patch card intact (it is not nested in it).
      await page.getByRole("tab", { name: "Chat", exact: true }).click();
      await expect(editor).not.toBeVisible();
      await expect(patchTool).toBeVisible();
    });
  });

  test("a relative patch path resolves against the conversation cwd", async ({ page, request }) => {
    test.setTimeout(60000);

    // A successful patch records an absolutized path, so the relative branch is
    // only reachable for a FAILED patch, where the card falls back to the path
    // the agent passed. "example" is missing from this file, so the replace
    // fails and the card keeps "./sub/notes.txt".
    await withTempDir("shelley-patchedit-rel-", async (dir) => {
      mkdirSync(join(dir, "sub"), { recursive: true });
      writeFileSync(join(dir, "sub", "notes.txt"), "nothing to replace here\n");

      const slug = await createConversationViaAPI(request, "patch: ./sub/notes.txt", { cwd: dir });
      await disableScreenReaderMode(page);
      await page.goto(`/c/${slug}`);
      await page.waitForLoadState("domcontentloaded");

      const patchTool = page.locator('.patch-tool[data-testid="tool-call-completed"]').first();
      await expect(patchTool).toBeVisible({ timeout: 15000 });
      await expect(patchTool.locator(".patch-tool-filename")).toHaveText("./sub/notes.txt");
      await expect(patchTool.locator(".patch-tool-error")).toBeVisible();
      await expect(patchTool.locator(".patch-tool-details")).toBeHidden();
      // The toggle, not the header's center: that is the filename, which opens
      // the file in the workspace instead of expanding the card.
      await patchTool.locator(".patch-tool-toggle").click();
      await expect(patchTool.locator(".patch-tool-error-message")).toBeVisible();

      await patchTool.getByRole("button", { name: "Open in editor" }).click();

      // Resolved against the conversation cwd into an absolute path.
      const editor = await expectFileInEditor(page, join(dir, "sub", "notes.txt"));
      await expect(
        editor.locator(".view-line", { hasText: "nothing to replace here" }).first(),
      ).toBeVisible({ timeout: 15000 });
    });
  });
});
