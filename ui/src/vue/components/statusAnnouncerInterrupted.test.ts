import assert from "node:assert/strict";
import { mountVueComponent } from "../../../scripts/vue-component-test";

const fixture = await mountVueComponent("src/vue/components/StatusAnnouncer.vue", {
  agentWorking: false,
  interrupted: false,
});
try {
  fixture.props.interrupted = true;
  await fixture.flush();
  const region = fixture.container.querySelector('[data-testid="status-announcer"]');
  assert.equal(region?.textContent?.trim(), "Conversation interrupted. Continue is available.");
  assert.equal(region?.getAttribute("aria-live"), "polite");
  assert.equal(region?.getAttribute("aria-atomic"), "true");
  fixture.props.agentWorking = true;
  fixture.props.interrupted = false;
  await fixture.flush();
  fixture.props.agentWorking = false;
  fixture.props.interrupted = true;
  await fixture.flush();
  assert.equal(region?.textContent?.trim(), "Conversation interrupted. Continue is available.");
  assert.ok(
    !region?.textContent?.includes("finished"),
    "interruption is not announced as successful completion",
  );
} finally {
  fixture.close();
}
console.log("StatusAnnouncer rendered interrupted-turn contract passed");
