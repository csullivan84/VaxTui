import { expect, test } from "@playwright/test";
import { testWorkingDirectory } from "./helpers";

interface HerdResponse {
  id: string;
}

interface HerdMemberResponse {
  id: string;
}

test("attaches a Herd PTY only on explicit focus and exposes readable terminal output", async ({
  page,
  request,
}) => {
  const herd = await request.post("/api/herds", {
    data: {
      name: `a11y-herd-${Date.now()}`,
      default_cwd: testWorkingDirectory(),
      default_command: "sh",
    },
  });
  expect(herd.ok()).toBeTruthy();
  const { id: herdId } = (await herd.json()) as HerdResponse;

  const member = await request.post(`/api/herds/${herdId}/members`, {
    data: {
      label: "Readable Herd terminal",
      recipe: {
        command: "printf 'HERD_A11Y_READY\\n'; exec sh",
        cwd: testWorkingDirectory(),
        env: {},
      },
    },
  });
  expect(member.ok()).toBeTruthy();
  const { id: memberId } = (await member.json()) as HerdMemberResponse;
  const opened = await request.post(`/api/herds/${herdId}/members/${memberId}/open`);
  expect(opened.ok()).toBeTruthy();

  const sockets: string[] = [];
  page.on("websocket", (socket) => sockets.push(socket.url()));
  await page.goto(`/herds/${herdId}`);
  const memberButton = page.getByRole("button", { name: /Readable Herd terminal/ });
  await expect(memberButton).toBeVisible();
  await expect(page.getByText(/Terminal is not attached to the UI/)).toBeVisible();
  expect(sockets.filter((url) => url.includes("/api/exec-ws"))).toHaveLength(0);

  await page.getByRole("button", { name: "Focus terminal" }).click();
  const terminal = page.locator(".herds-xterm-host [data-terminal-id]");
  const log = terminal.getByRole("log", { name: /terminal output/i });
  await expect(log).toBeVisible();
  await expect(log).toContainText("HERD_A11Y_READY");
  await expect.poll(() => sockets.some((url) => url.includes("/api/exec-ws"))).toBeTruthy();
});

test("Herd open and graceful close-all have named keyboard paths without implicit PTY attach", async ({
  page,
  request,
}) => {
  const created = await request.post("/api/herds", {
    data: {
      name: `keyboard-herd-${Date.now()}`,
      default_cwd: testWorkingDirectory(),
      default_command: "sh",
    },
  });
  expect(created.ok()).toBeTruthy();
  const { id } = (await created.json()) as HerdResponse;
  const member = await request.post(`/api/herds/${id}/members`, {
    data: {
      label: "Keyboard herd member",
      recipe: { command: "printf 'BULK_HERD_READY\\n'; exec sh", cwd: testWorkingDirectory(), env: {} },
    },
  });
  expect(member.ok()).toBeTruthy();
  const sockets: string[] = [];
  page.on("websocket", (socket) => sockets.push(socket.url()));
  try {
    await page.goto(`/herds/${id}`);
    const open = page.getByRole("button", { name: "Open all", exact: true });
    await open.focus();
    await expect(open).toBeFocused();
    await page.keyboard.press("Space");
    const summary = page.locator(".herds-bulk-result");
    await expect(summary).toContainText("Opened 1, unchanged 0, failed 0");
    await expect(summary).not.toHaveAttribute("role", "status");
    await expect(page.locator('.herds-page > [role="status"]')).toHaveCount(1);
    await expect(page.getByText(/Terminal is not attached to the UI/)).toBeVisible();
    expect(sockets.filter((url) => url.includes("/api/exec-ws"))).toHaveLength(0);

    const close = page.getByRole("button", { name: "Close all", exact: true });
    await close.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Close all terminals" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Close 1 terminal?");
    const confirm = dialog.getByRole("button", { name: "Close all terminals", exact: true });
    await confirm.focus();
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Space");
    await expect(dialog).toHaveCount(0);
    await expect(summary).toContainText("Closed 1, unchanged 0, failed 0");
    await expect(summary).not.toHaveAttribute("role", "status");
    await expect(page.locator('.herds-page > [role="status"]')).toHaveCount(1);
    const detail = await request.get(`/api/herds/${id}`);
    expect(detail.ok()).toBeTruthy();
    const body = (await detail.json()) as { members: Array<{ process_state: string }> };
    expect(body.members.map((item) => item.process_state)).toEqual(["closed"]);
    expect(sockets.filter((url) => url.includes("/api/exec-ws"))).toHaveLength(0);
  } finally {
    // Only the pack created in this private harness belongs to this test.
    await request.post(`/api/herds/${id}/close`, { data: { mode: "graceful" } });
  }
});
