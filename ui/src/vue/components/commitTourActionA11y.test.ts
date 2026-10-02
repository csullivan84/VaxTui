import assert from "node:assert/strict";
import { mountVueComponent } from "../../../scripts/vue-component-test";

const originalFetch = globalThis.fetch;
globalThis.fetch = async () =>
  new Response(
    JSON.stringify({ status: "building", hash: "a11y-hash", worker_slug: "tour-worker" }),
    { headers: { "content-type": "application/json" } },
  );

const fixture = await mountVueComponent("src/vue/components/CommitTourAction.vue", {
  cwd: "/tmp/a11y-repo",
  hash: "a11y-hash",
  conversationId: "conversation",
});
try {
  await fixture.flush();
  const buildingLink = fixture.container.querySelector<HTMLAnchorElement>(".commit-tour-action");
  assert.ok(buildingLink, "building tour renders a navigable link when a worker exists");
  assert.equal(
    buildingLink.getAttribute("tabindex"),
    null,
    "the Building tour link remains in the normal Tab sequence",
  );
} finally {
  fixture.close();
  globalThis.fetch = originalFetch;
}
console.log("CommitTourAction building-link Tab contract passed");
