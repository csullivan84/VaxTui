import { test, expect } from "@playwright/test";

/**
 * Minimal a11y smoke: skip-link + status announcer exist on the shell.
 * Does not drive VoiceOver; guards against deleting the landmarks.
 */
test("skip-link and status announcer are present", async ({ page }) => {
  await page.goto("/");
  const skip = page.locator('a.skip-link[href="#shelley-message-input"]');
  await expect(skip).toHaveCount(1);
  await expect(page.getByTestId("status-announcer")).toHaveCount(1);
  await expect(page.locator("[data-a11y-transcript]")).toHaveCount(1);
});
