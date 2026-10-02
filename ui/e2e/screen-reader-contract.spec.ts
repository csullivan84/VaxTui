import { expect, test } from "@playwright/test";
import { createConversationViaAPI } from "./helpers";

test("screen-reader mode expands actual tool output and collapsed output remains readable", async ({
  page,
  request,
}) => {
  const slug = await createConversationViaAPI(request, "bash: printf 'SCREEN_READER_OUTPUT\\n'");
  await page.goto(`/c/${slug}`);
  const tool = page.locator(".bash-tool").filter({ hasText: "SCREEN_READER_OUTPUT" }).first();
  const header = tool.locator(".bash-tool-header");
  const details = tool.getByTestId("bash-tool-details");
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(details).toBeVisible();
  await expect(details).toContainText("SCREEN_READER_OUTPUT");

  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "false");
  const readableOutput = tool.getByTestId("bash-tool-output-sr");
  await expect(readableOutput).toHaveAttribute("role", "region");
  await expect(readableOutput).toHaveAttribute("aria-label", /output/i);
  await expect(readableOutput).toContainText("SCREEN_READER_OUTPUT");
  await page.getByRole("button", { name: "More options" }).click();
  const toggle = page.getByTestId("screen-reader-mode-toggle");
  await toggle.getByRole("button", { name: "Off", exact: true }).click();
  await toggle.getByRole("button", { name: "On (expand tools)", exact: true }).click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(details).toBeVisible();
});
