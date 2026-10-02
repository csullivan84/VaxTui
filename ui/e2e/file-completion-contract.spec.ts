import { expect, test } from "@playwright/test";

// VaxTui removed the legacy completion picker. The accessible replacement is
// the new-conversation CWD chip and DirectoryPickerModal: its selected
// breadcrumb is announced as the current location and closing returns focus to
// the opener, so keyboard users can continue configuring the composer.
test("CWD directory picker exposes the selected location and restores chip focus", async ({ page }) => {
  await page.goto("/new");
  const chip = page.locator(".status-field-cwd .status-chip");
  await expect(chip).toBeVisible();
  await chip.click();
  const picker = page.locator(".modal.directory-picker-modal");
  await expect(picker).toBeVisible();
  await expect(picker.locator('.directory-picker-breadcrumb [aria-current="location"]')).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(chip).toBeFocused();
});
