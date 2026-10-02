import { mountVueComponent } from "../../../scripts/vue-component-test";

const view = await mountVueComponent("src/vue/components/RecordButton.vue", {
  canRecordAudio: true,
  screenAvailable: true,
});
try {
  const button = view.container.querySelector<HTMLButtonElement>("[data-testid=voice-button]");
  if (!button) throw new Error("FAIL: RecordButton renders its voice control");
  if (button.hasAttribute("aria-haspopup")) {
    throw new Error("FAIL: a recording button must not claim it opens a menu when its controls are a group");
  }
  if (button.getAttribute("aria-expanded") !== "false") {
    throw new Error("FAIL: screen recording affordance exposes collapsed state");
  }
  console.log("✓ RecordButton describes its expandable recording group honestly");
} finally {
  view.close();
}
