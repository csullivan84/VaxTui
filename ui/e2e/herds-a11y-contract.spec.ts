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
