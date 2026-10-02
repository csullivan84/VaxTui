import { expect, test } from "@playwright/test";
import { createConversationViaAPI, selectWorkspace, testWorkingDirectory } from "./helpers";

test.describe("desktop composer focus after submission", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  for (const method of ["keyboard", "button"] as const) {
    test(`${method} send returns focus to the composer, not the transcript`, async ({
      page,
      request,
    }) => {
      await selectWorkspace(page, request, testWorkingDirectory());
      const slug = await createConversationViaAPI(request, `focus contract ${method}`);
      await page.goto(`/c/${slug}`);
      await page.evaluate(() => {
        document.documentElement.dataset.transcriptFocusCount = "0";
        document.addEventListener("focusin", (event) => {
          if ((event.target as Element | null)?.closest(".messages-transcript-region")) {
            const root = document.documentElement;
            root.dataset.transcriptFocusCount = String(
              Number(root.dataset.transcriptFocusCount) + 1,
            );
          }
        });
      });
      const input = page.getByRole("textbox", { name: "Message input" });
      await input.fill(`A new message sent by ${method}`);
      if (method === "keyboard") await input.press("Enter");
      else await page.getByTestId("send-button").click();
      await expect(input).toHaveValue("");
      await expect(input).toBeEnabled();
      await expect(input).toBeFocused();
      expect(await page.locator("html").getAttribute("data-transcript-focus-count")).toBe("0");
    });
  }
});

test("touch Enter submits under the default send preference", async ({ page, request }) => {
  await selectWorkspace(page, request, testWorkingDirectory());
  await page.goto("/new");
  const input = page.getByRole("textbox", { name: "Message input" });
  await input.fill("Touch Enter must send this message");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(page.getByText("Touch Enter must send this message", { exact: true })).toBeVisible();
});
