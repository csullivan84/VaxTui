import assert from "node:assert/strict";
import { mountVueComponent } from "../../../scripts/vue-component-test";

const setup = await mountVueComponent("src/vue/components/CommentDialog.vue", {
  where: "setup",
  text: "",
});
setup.close();
const originalFetch = globalThis.fetch;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
HTMLElement.prototype.scrollIntoView = () => {};
globalThis.fetch = async () =>
  new Response(
    JSON.stringify({
      commits: [
        {
          hash: "0123456789abcdef",
          shortHash: "0123456",
          parents: [],
          subject: "Make graph rows reachable",
          author: "A User",
          email: "a@example.test",
          timestamp: 0,
          refs: [],
          isHead: true,
        },
        {
          hash: "fedcba9876543210",
          shortHash: "fedcba9",
          parents: [],
          subject: "Second reachable commit",
          author: "A User",
          email: "a@example.test",
          timestamp: 0,
          refs: [],
          isHead: false,
        },
      ],
      gitRoot: "/repo",
      currentBranch: "main",
    }),
    { headers: { "content-type": "application/json" } },
  );

const view = await mountVueComponent("src/vue/components/GitGraphViewer.vue", {
  cwd: "/repo",
  isOpen: true,
  canOpenDiff: true,
});
try {
  await view.flush();
  const list = view.container.querySelector(".git-graph-list");
  const row = view.container.querySelector<HTMLElement>(".git-graph-row");
  const rows = view.container.querySelectorAll<HTMLElement>(".git-graph-row");
  assert.equal(list?.getAttribute("role"), "list", "commit results expose a list");
  assert.equal(row?.getAttribute("role"), "listitem", "each commit is a list item");
  assert.equal(row?.getAttribute("tabindex"), "0", "each commit can receive keyboard focus");
  assert.equal(
    row?.getAttribute("aria-label"),
    "Commit 0123456: Make graph rows reachable",
    "each commit has a spoken label",
  );
  const second = rows[1];
  assert.ok(second, "the second commit renders");
  second.dispatchEvent(new view.window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
  await view.flush();
  assert.ok(second.classList.contains("git-graph-row-selected"), "Space selects the focused row");
} finally {
  view.close();
  globalThis.fetch = originalFetch;
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
}
console.log("GitGraphViewer commit row accessibility passed");
