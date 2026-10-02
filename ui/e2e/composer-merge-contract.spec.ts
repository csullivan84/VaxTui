import { expect, test } from "@playwright/test";

test("skip link targets the message composer", async ({ page }) => {
  await page.goto("/new");
  const skip = page.getByRole("link", { name: "Skip to message input" });
  await expect(skip).toHaveAttribute("href", "#shelley-message-input");
  await skip.click();
  await expect(page.locator("#shelley-message-input")).toBeFocused();
});

test("file completion exposes a polite suggestion status", async ({ page }) => {
  await page.goto("/new");
  const input = page.getByRole("textbox", { name: "Message input" });
  await input.fill("@exam");
  await expect(page.locator(".message-input-form [aria-live=polite][aria-atomic=true]")).toHaveText(
    /file suggestion|searching files/i,
  );
});

test("updated send keystroke preference requires a modifier before submitting", async ({ page }) => {
  await page.goto("/new");
  const input = page.getByRole("textbox", { name: "Message input" });
  await input.fill("Keep this draft until modified Enter");
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("shelley:send-keystroke-change", { detail: "modifier-enter" }),
    );
  });

  await input.press("Enter");
  await expect(input).toHaveValue("Keep this draft until modified Enter\n");
  await input.press("ControlOrMeta+Enter");
  await expect(input).toHaveValue("");
});
