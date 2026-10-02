import assert from "node:assert/strict";
import { mountVueComponent } from "../../../scripts/vue-component-test";

const changes: string[] = [];
const fixture = await mountVueComponent(
  "src/vue/components/ModelPicker.vue",
  {
    models: [{ id: "fixture-model", ready: true, tier: 1, supports_reasoning: true,
      default_reasoning_level: "medium", reasoning_levels: ["low", "medium", "high"] },
      { id: "extra-model", ready: true, tier: 2 }],
    selectedModel: "fixture-model",
    thinkingLevel: "default",
    showRecent: false,
    onThinkingChange: (value: string) => {
      changes.push(value);
      fixture.props.thinkingLevel = value;
    },
  },
  {
    moduleStubs: {
      "primevue/select": `import { h } from 'vue';
        export default { methods: { hide() {} }, render() {
          return h('section', [this.$slots.value?.(), this.$slots.footer?.()]);
        } };`,
      "../composables/subagentLive":
        `export const ConversationsListKey = Symbol.for('fixture-conversations');`,
    },
    configure: (app, _bindings, vue) =>
      app.provide(Symbol.for("fixture-conversations"), vue.ref([])),
  },
);

function radios() {
  return [...fixture.container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
}
async function key(button: HTMLButtonElement, value: string) {
  const event = new fixture.window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true });
  button.dispatchEvent(event);
  await fixture.flush();
  assert.equal(event.defaultPrevented, true, "radio navigation does not reach the model list");
}
try {
  const group = fixture.container.querySelector('[role="radiogroup"]');
  assert.ok(group);
  const label = fixture.container.querySelector(`#${group.getAttribute("aria-labelledby")}`);
  assert.match(label?.textContent ?? "", /effort/i);
  assert.deepEqual(radios().map((r) => r.tabIndex), [-1, 0, -1], "one radio in the Tab order");
  radios()[1].focus();
  await key(radios()[1], "ArrowRight");
  assert.deepEqual(changes, ["high"]);
  assert.equal(fixture.document.activeElement, radios()[2]);
  assert.equal(radios()[2].getAttribute("aria-checked"), "true");
  await key(radios()[2], "ArrowDown");
  assert.equal(fixture.document.activeElement, radios()[0], "arrows wrap");
  assert.equal(changes.at(-1), "low");
  await key(radios()[0], "End");
  assert.equal(fixture.document.activeElement, radios()[2]);
  await key(radios()[2], "Home");
  assert.equal(fixture.document.activeElement, radios()[0]);
  const more = fixture.container.querySelector<HTMLButtonElement>(".model-picker-more");
  assert.equal(more?.getAttribute("aria-expanded"), "false");
  more!.click();
  await fixture.flush();
  assert.equal(more?.getAttribute("aria-expanded"), "true");
} finally {
  fixture.close();
}
console.log("ModelPicker named effort radios support roving Tab and arrow/Home/End selection");
