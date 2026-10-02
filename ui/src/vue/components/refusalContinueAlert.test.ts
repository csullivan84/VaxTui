import assert from "node:assert/strict";
import { mountVueComponent } from "../../../scripts/vue-component-test";

const originalFetch = globalThis.fetch;
let sent = 0;
globalThis.fetch = async (input, init) => {
  assert.equal(input, "/api/conversation/fixture-refusal/continue");
  assert.equal(init?.method, "POST");
  assert.deepEqual(JSON.parse(String(init?.body)), { model: "fixture-next" });
  sent++;
  return new Response("Fixture continuation failed", { status: 503 });
};
const fixture = await mountVueComponent(
  "src/vue/components/RefusalContinueButton.vue",
  { conversationId: "fixture-refusal", refusalModel: "fixture-refused" },
  {
    // Only the model-picker event boundary is stubbed. The target SFC's real
    // callback, API request/rejection and rendering execute unchanged.
    childStubs: {
      "ModelPicker.vue":
        "import {h} from 'vue'; export default { emits:['select-model'], " +
        "render(){return h('button',{onClick:()=>this.$emit('select-model','fixture-next')},'Choose another model')} };",
    },
    configure(app, bindings, vue) {
      app.provide(bindings.RefusalContinueKey as symbol, {
        models: vue.ref([]),
        selectedModel: vue.ref("fixture-refused"),
        thinkingLevel: vue.ref("default"),
      });
    },
  },
);
try {
  fixture.container.querySelector<HTMLButtonElement>("button")!.click();
  await fixture.flush();
  await fixture.flush();
  assert.equal(sent, 1);
  assert.equal(
    fixture.container.querySelector(".error-retry-error")?.textContent,
    "Fixture continuation failed",
  );
  assert.equal(
    fixture.container.querySelector('[role="alert"]')?.textContent,
    "Fixture continuation failed",
  );
} finally {
  fixture.close();
  globalThis.fetch = originalFetch;
}
console.log("Refusal continuation rejection is rendered as an alert");
