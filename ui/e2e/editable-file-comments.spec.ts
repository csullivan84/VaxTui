import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConversationViaAPI, selectWorkspace } from "./helpers";

// Upstream opens fuzzy-finder picks in an "Edit file" modal with a comment
// mode. This fork opens them in the Workbench file editor instead, whose
// "Ask Shelley" action carries the selected line into the chat message input
// as a file#line reference plus the quoted code.

test.describe("Workbench file editor line reference", () => {
  // The editor toolbar is exercised on desktop (the default project viewport
  // is mobile-sized).
  test.use({ viewport: { width: 1280, height: 800 } });

  test("asking about a line flows into the message input", async ({ page, request }) => {
    test.setTimeout(60000);

    // A file with known content, in the conversation's cwd and the workspace
    // (which the file finder searches in this fork).
    const dir = mkdtempSync(join(tmpdir(), "shelley-editfile-"));
    writeFileSync(
      join(dir, "notes.txt"),
      "alpha first line\nbravo second line\ncharlie third line\n",
    );

    await selectWorkspace(page, request, dir);
    const slug = await createConversationViaAPI(request, "Hello", { cwd: dir });
    await page.goto(`/c/${slug}`);
    await page.waitForLoadState("domcontentloaded");

    // Open the fuzzy file finder and pick the file.
    await page.keyboard.press("ControlOrMeta+P");
    const finderInput = page.locator(".grp-filter");
    await expect(finderInput).toBeVisible({ timeout: 10000 });
    await finderInput.fill("notes.txt");
    await expect(page.locator(".grp-body").getByText("notes.txt")).toBeVisible({
      timeout: 10000,
    });
    await finderInput.press("Enter");

    // The pick opens as a Workbench editor tab.
    await expect(page.getByRole("tab", { name: "Workbench" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const editor = page.getByRole("region", { name: "File editor" });
    await expect(editor.getByRole("tab", { name: "notes.txt" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Select the second line and ask Shelley about it.
    await editor.locator(".view-line", { hasText: "bravo second line" }).click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await editor.getByRole("button", { name: "Ask Shelley" }).click();

    // Chat comes back with the reference and quoted line in the composer.
    await expect(page.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("message-input")).toHaveValue(
      "Please look at notes.txt#L2.\n\n```\nbravo second line\n```",
    );
  });
});
