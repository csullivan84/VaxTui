import { expect, test } from "@playwright/test";
import { createConversationViaAPIWithDetails } from "./helpers";

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

test("updated send keystroke preference requires a modifier before submitting", async ({
  page,
}) => {
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

test("with the modifier-Enter preference, Ctrl+Enter sends instead of compacting", async ({
  page,
  request,
}) => {
  const { conversationId, slug } = await createConversationViaAPIWithDetails(
    request,
    "echo: modifier send seed",
  );
  let compactRequests = 0;
  const chatRequests: Array<{ message?: string; queue?: boolean }> = [];
  await page.route("**/api/conversations/distill-new-generation", async (route) => {
    compactRequests++;
    await route.fulfill({ json: { conversation_id: conversationId, current_generation: 2 } });
  });
  await page.route(`**/api/conversation/${conversationId}/chat`, async (route) => {
    chatRequests.push(route.request().postDataJSON());
    await route.fulfill({ json: {} });
  });
  await page.goto(`/c/${slug}`);
  const input = page.getByRole("textbox", { name: "Message input" });
  await expect(input).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("shelley:send-keystroke-change", { detail: "modifier-enter" }),
    );
  });
  await input.fill("sent with the modifier");
  await page.keyboard.down("Control");
  await expect(page.getByTestId("send-button")).not.toHaveAttribute(
    "aria-label",
    "Compact and send",
  );
  await page.keyboard.up("Control");
  await input.press("Control+Enter");

  await expect.poll(() => chatRequests.map((r) => r.message)).toEqual(["sent with the modifier"]);
  expect(chatRequests[0].queue).toBeFalsy();
  expect(compactRequests).toBe(0);
});
