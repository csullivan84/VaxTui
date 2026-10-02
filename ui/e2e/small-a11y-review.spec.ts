import { expect, test, type Page } from "@playwright/test";
import {
  createConversationViaAPIWithDetails,
  disableScreenReaderMode,
  installTranscriptionAvailability,
} from "./helpers";

async function openIntegrations(page: Page) {
  await page.addInitScript(() => {
    let init: Record<string, unknown> | undefined;
    Object.defineProperty(window, "__SHELLEY_INIT__", {
      configurable: true,
      get: () => init,
      set(value) {
        init = { ...(value as Record<string, unknown>), is_exe_dev: true };
      },
    });
  });
  await page.route("**/api/integrations**", async (route) => {
    const name = new URL(route.request().url()).searchParams.get("details");
    await route.fulfill({
      json: {
        integrations: name
          ? [{ name, type: "github", url: "https://example.test" }]
          : [{ name: "example", type: "github", url: "https://example.test" }],
      },
    });
  });
  await page.goto("/new");
  await page.keyboard.press("ControlOrMeta+k");
  const search = page.getByRole("combobox", { name: "Search commands and conversations" });
  await search.fill("integration");
  await page.getByRole("option", { name: /VM Integrations/i }).click();
  await expect(page.getByRole("dialog", { name: "VM Integrations" })).toBeVisible();
}

test("integration tabs use arrow, Home, and End to move focus and selection", async ({ page }) => {
  await openIntegrations(page);
  await page.locator(".integrations-name-btn").click();
  const list = page.getByRole("tab", { name: /Attached/ });
  const detail = page.getByRole("tab", { name: "example", exact: true });
  await detail.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(list).toBeFocused();
  await expect(list).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(detail).toBeFocused();
  await expect(detail).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(list).toBeFocused();
  await expect(list).toHaveAttribute("aria-selected", "true");
});

test("voice-and-screen record menu declares popup state for keyboard users", async ({ page }) => {
  await installTranscriptionAvailability(page, true);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getDisplayMedia: async () => new MediaStream(),
        getUserMedia: async () => new MediaStream(),
      },
    });
  });
  await page.goto("/new");
  const button = page.getByTestId("voice-button");
  await button.focus();
  await expect(button).not.toHaveAttribute("aria-haspopup");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("record-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toBeFocused();
});

test("an interrupted generic tool call is not announced as succeeded", async ({
  page,
  request,
}) => {
  const { conversationId, slug } = await createConversationViaAPIWithDetails(
    request,
    "echo: fixture",
  );
  const response = await request.get(`/api/conversation/${conversationId}`);
  const body = await response.json();
  body.conversation.agent_working = false;
  body.conversation.turn_interrupted = true;
  body.conversation.current_generation = 1;
  body.messages = [
    {
      message_id: "interrupted-tool",
      conversation_id: conversationId,
      sequence_id: 1,
      type: "agent",
      generation: 1,
      llm_data: JSON.stringify({
        Role: 1,
        Content: [
          { ID: "unfinished", Type: 5, ToolName: "future_tool", ToolInput: { task: "work" } },
        ],
        EndOfTurn: false,
      }),
      created_at: "2026-10-02T00:00:00Z",
    },
  ];
  await page.route("**/api/stream2*", (route) => route.abort());
  await page.route("**/api/conversations/snapshot", (route) =>
    route.fulfill({
      json: {
        conversations: [{ ...body.conversation, slug, working: false }],
        hash: "interrupted-fixture",
      },
    }),
  );
  await page.route(`**/api/conversation/${conversationId}`, (route) =>
    route.fulfill({ json: body }),
  );
  await disableScreenReaderMode(page);
  await page.goto(`/c/${slug}`);
  const card = page.getByTestId("tool-call-completed");
  await expect(card).toBeVisible();
  await expect(card).toContainText("interrupted");
  await expect(card).not.toContainText("succeeded");
});
