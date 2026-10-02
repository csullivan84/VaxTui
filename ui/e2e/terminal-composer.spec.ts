import { expect, test } from "@playwright/test";
import {
  createConversationViaAPIWithDetails,
  selectWorkspace,
  testWorkingDirectory,
} from "./helpers";

test.use({ viewport: { width: 1280, height: 720 }, isMobile: false, hasTouch: false });

test("opens terminals for bare shell commands", async ({ page, request }) => {
  await selectWorkspace(page, request, testWorkingDirectory());
  const { conversationId } = await createConversationViaAPIWithDetails(
    request,
    "terminal composer test",
  );
  await page.goto(`/c/${conversationId}`);

  const input = page.getByTestId("message-input");
  await input.fill("!");
  await page.getByTestId("send-button").click();
  await expect(page.locator(".terminal-panel-tab")).toHaveCount(1);
  await expect(input).toHaveValue("");
  await expect(page.getByRole("log", { name: /terminal output/i })).not.toContainText("Error:");

  // Terminals intentionally open in Workbench. Return to the visible
  // composer before asking for another shell, instead of filling hidden UI.
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await input.fill("/shell");
  await expect(input).toHaveValue("!");
  await page.getByTestId("send-button").click();
  await expect(page.locator(".terminal-panel-tab")).toHaveCount(2);
  await expect(input).toHaveValue("");
});
