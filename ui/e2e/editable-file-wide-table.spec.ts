import { expect, test } from "@playwright/test";
import { createConversationViaAPI } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

test("keeps a wide Markdown table inside the mobile file-preview reading pane", async ({
  page,
  request,
}) => {
  await page.route("**/api/user-agents-md", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        path: "/private/test-home/.config/shelley/AGENTS.md",
        content:
          "# Mobile notes\n\n| Key | Very long description |\n| --- | --- |\n| Value | " +
          "unbrokenvalue".repeat(20) +
          " |\n",
      }),
    }),
  );
  const slug = await createConversationViaAPI(request, "Hello");
  await page.goto(`/c/${slug}`);
  await page.locator(".chat-overflow-menu-wrapper .btn-icon").click();
  await page
    .locator(".overflow-menu-item")
    .filter({ hasText: /Edit User AGENTS\.md/ })
    .click();
  const modal = page.getByRole("dialog", { name: "Edit AGENTS.md" });
  await expect(modal.locator(".monaco-editor")).toBeVisible();
  await expect(modal.getByRole("button", { name: "Split view" })).toHaveCount(0);
  await modal.getByRole("button", { name: "Preview mode" }).click();
  const preview = modal.getByRole("region", { name: "Markdown preview" });
  await expect(preview.getByRole("heading", { name: "Mobile notes" })).toBeVisible();
  await expect(preview.getByRole("table")).toBeVisible();
  const widths = await preview.evaluate((element) => ({
    pane: element.clientWidth,
    content: element.scrollWidth,
  }));
  expect(widths.pane).toBeGreaterThan(0);
  expect(widths.content).toBeLessThanOrEqual(widths.pane);
  await modal.getByRole("button", { name: "Edit mode" }).click();
  await expect(modal.locator(".monaco-editor textarea.inputarea")).not.toBeFocused();
  await expect(modal.locator(".agents-md-header-path")).toBeVisible();
});
