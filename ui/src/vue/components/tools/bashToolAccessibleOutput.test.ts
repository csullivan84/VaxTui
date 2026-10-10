import assert from "node:assert/strict";
import { mountVueComponent } from "../../../../scripts/vue-component-test";

const fixture = await mountVueComponent("src/vue/components/tools/BashTool.vue", {
  toolInput: { command: "printf red" },
  toolResult: [{ Type: 2, Text: "\u001b[31mred\u001b[0m done" }],
  isRunning: false,
});
try {
  await fixture.flush();
  fixture.container.querySelector<HTMLElement>(".bash-tool-header")?.click();
  await fixture.flush();
  const region = fixture.container.querySelector('[data-testid="bash-tool-output-sr"]');
  assert.equal(region?.textContent?.trim(), "red done");
} finally {
  fixture.close();
}
console.log("BashTool collapsed output is read without ANSI escapes");
