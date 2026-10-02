import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createConversationViaAPIWithDetails,
  git,
  initGitRepo,
  withTempDir,
} from "./helpers";

test("git graph announces the selected commit and keeps focus on the build-tour replacement", async ({
  page,
  request,
}) => {
  await withTempDir("shelley-git-graph-a11y-", async (tempDir) => {
    const repo = join(tempDir, "repo");
    mkdirSync(repo);
    initGitRepo(repo);
    writeFileSync(join(repo, "example.txt"), "before\n");
    git(repo, "add", "example.txt");
    git(repo, "commit", "-m", "Base accessible commit");
    const baseHash = git(repo, "rev-parse", "HEAD");
    const baseShortHash = git(repo, "rev-parse", "--short", "HEAD");
    writeFileSync(join(repo, "example.txt"), "after\n");
    git(repo, "commit", "-am", "Build accessible tour");

    const { conversationId, slug } = await createConversationViaAPIWithDetails(request, "Hello", {
      cwd: repo,
    });
    const { slug: builderSlug } = await createConversationViaAPIWithDetails(request, "Hello", {
      cwd: repo,
    });
    let requestedHash = baseHash;
    await page.route("**/api/git/tour/status?*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ status: "absent", hash: requestedHash }),
      });
    });
    await page.route(`**/api/conversation/${conversationId}/chat`, async (route) => {
      const message = (route.request().postDataJSON() as { message?: string }).message;
      if (!message?.startsWith("/tour ")) return route.continue();
      requestedHash = message.split("\n", 1)[0].slice("/tour ".length);
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          status: "accepted",
          tour: { status: "building", hash: requestedHash, worker_slug: builderSlug },
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/c/${slug}`);
    await expect(page.getByTestId("message-input")).toBeVisible({ timeout: 30_000 });
    await page.locator(".chat-overflow-menu-wrapper .btn-icon").click();
    await page.locator(".overflow-menu-item", { hasText: /git graph/i }).click();

    const graph = page.locator(".git-graph-container");
    const baseRow = graph.locator(".git-graph-row", { hasText: "Base accessible commit" });
    await expect(baseRow).toBeVisible({ timeout: 30_000 });
    await baseRow.click();
    await expect(page.getByTestId("status-announcer")).toHaveText(
      `Commit ${baseShortHash}: Base accessible commit`,
    );

    const actions = graph.locator(".git-graph-detail-actions");
    const build = actions.getByRole("button", { name: "Build tour" });
    await expect(build).toBeVisible();
    await build.click();
    const building = actions.getByRole("link", { name: "Building tour" });
    await expect(building).toBeFocused();
    await expect(building).toHaveAttribute("href", `/c/${builderSlug}`);
  });
});
