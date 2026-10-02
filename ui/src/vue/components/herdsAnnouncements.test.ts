import assert from "node:assert/strict";
import { mountVueComponent } from "../../../scripts/vue-component-test";

const originalFetch = globalThis.fetch;
const requests: Array<{ url: string; init?: RequestInit }> = [];
const herd = {
  id: "fixture-herd",
  name: "Accessible herd",
  lifecycle: "active",
  members: [],
  summary: { total: 0, open: 0, closed: 0, missing: 0, working: 0, needs_user: 0 },
};
globalThis.fetch = async (input, init) => {
  const url = String(input);
  requests.push({ url, init });
  let data: unknown;
  if (url === "/api/herds/fixture-herd") data = herd;
  else if (url.endsWith("/close-preview")) data = { live_terminals: 1, warnings: [] };
  else if (url.endsWith("/open")) data = { items: [{ label: "Fixture", outcome: "opened" }] };
  else if (url.endsWith("/close")) {
    data = { items: [{ label: "Fixture", outcome: "closed", terminal_id: "fixture-terminal" }] };
  } else throw new Error(`Unexpected request: ${url}`);
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
};

const fixture = await mountVueComponent(
  "src/vue/components/HerdsPage.vue",
  { herdId: herd.id, conversations: [] },
  {
    moduleStubs: {
      "primevue/button": `import { h } from 'vue';
        export default { props: ['label', 'disabled'], render() {
          return h('button', { type: 'button', disabled: this.disabled }, this.label);
        } };`,
    },
    childStubs: {
      "Modal.vue": `import { h } from 'vue';
        export default { props: ['isOpen', 'title'], render() {
          return this.isOpen ? h('section', {role:'dialog', 'aria-label':this.title},
            [this.$slots.default?.(), this.$slots.footer?.()]) : null;
        } };`,
    },
  },
);

async function settle() {
  // Drain the HTTP JSON and Vue render promises without wall-clock waits.
  for (let i = 0; i < 4; i++) await fixture.flush();
}
function button(name: string) {
  const found = [...fixture.container.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() === name,
  );
  assert.ok(found, `named ${name} button is rendered`);
  return found;
}
function singleSummary(text: string) {
  const visible = fixture.container.querySelector(".herds-bulk-result");
  assert.equal(visible?.textContent, text, "result remains readable outside the live region");
  const regions = [...fixture.container.querySelectorAll('[role="status"], [aria-live="polite"]')]
    .filter((element) => element.textContent?.trim() === text);
  assert.equal(regions.length, 1, "bulk result has exactly one polite announcement owner");
  assert.equal(regions[0].getAttribute("aria-atomic"), "true");
}
try {
  await settle();
  button("Open all").click();
  await settle();
  singleSummary("Opened 1, unchanged 0, failed 0");
  assert.equal(requests.find((r) => r.url.endsWith("/open"))?.init?.method, "POST");

  button("Close all").click();
  await settle();
  assert.ok(fixture.container.querySelector('[role="dialog"][aria-label="Close all terminals"]'));
  assert.equal(requests.filter((r) => r.url.endsWith("/close")).length, 0, "preview is not a close");
  button("Close all terminals").click();
  await settle();
  singleSummary("Closed 1, unchanged 0, failed 0");
  assert.deepEqual(
    JSON.parse(String(requests.find((r) => r.url.endsWith("/close"))?.init?.body)),
    { mode: "graceful" },
  );
  assert.equal(fixture.container.querySelector('[role="dialog"]'), null, "confirmation closes");
} finally {
  fixture.close();
  globalThis.fetch = originalFetch;
}
console.log("Herd open/close visible summaries have one live announcement owner");
