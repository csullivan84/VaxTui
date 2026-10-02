import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import vuePlugin from "esbuild-plugin-vue3";
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

// ChatInterface gives both components the same error/stream state. Compile a
// parent with the real StatusAnnouncer and ChatStatusContent (rather than
// stubbing either) so this verifies the visible-status/canonical-announcer
// boundary. The nested status controls are irrelevant to this contract.
const componentsDir = fileURLToPath(new URL(".", import.meta.url));
const statusAnnouncerPath = fileURLToPath(new URL("./StatusAnnouncer.vue", import.meta.url));
const chatStatusPath = fileURLToPath(new URL("./ChatStatusContent.vue", import.meta.url));
const i18nPath = fileURLToPath(new URL("../composables/i18n.ts", import.meta.url));
const pairBuild = await build({
  stdin: {
    contents: `
      import { defineComponent, h } from "vue";
      import StatusAnnouncer from ${JSON.stringify(statusAnnouncerPath)};
      import ChatStatusContent from ${JSON.stringify(chatStatusPath)};
      import { i18nPlugin } from ${JSON.stringify(i18nPath)};
      const noOp = () => {};
      export { i18nPlugin };
      export default defineComponent({
        props: { agentWorking: Boolean, streamStatus: String, error: String },
        setup(props) {
          return () => [
            h(StatusAnnouncer, {
              agentWorking: props.agentWorking,
              streamStatus: props.streamStatus,
              error: props.error,
            }),
            h(ChatStatusContent, {
              conversationId: "fixture-conversation", streamStatus: props.streamStatus,
              error: props.error, agentWorking: props.agentWorking, interrupted: false,
              resumingInterrupted: false, cancelling: false, selectedCwd: "/fixture",
              contextWindowSize: 0, maxContextTokens: 0, usageEntries: [], otherUsageRows: [],
              messages: [], hostname: "fixture", models: [{ id: "fixture-model" }],
              selectedModel: "fixture-model", sending: false, refreshingModels: false,
              thinkingLevel: "default", toolOverrides: {}, toolOverrideList: [],
              toolOverrideCount: 0, cwdError: null, onUnarchive: noOp, onClearError: noOp,
              onCancel: noOp, onResumeInterrupted: noOp, onStartNewGeneration: noOp,
              onSelectModel: noOp, onSelectCombination: noOp, onSwitchConversationModel: noOp,
              onSwitchConversationCombination: noOp, onSwitchConversationThinkingLevel: noOp,
              onManageModels: noOp, onRefreshModels: noOp, onThinkingChange: noOp,
              onSetToolOverride: noOp, onResetToolOverrides: noOp,
              onOpenDirectoryPicker: noOp, onUsageNeeded: noOp,
            }),
          ];
        },
      });
    `,
    resolveDir: componentsDir,
    loader: "ts",
  },
  bundle: true,
  write: false,
  outfile: "/tmp/shelley-status-pair-test.cjs",
  platform: "node",
  format: "cjs",
  external: ["vue"],
  plugins: [
    {
      name: "stub-unrelated-status-children",
      setup(builder) {
        builder.onResolve({ filter: /\.vue$/ }, (args) => {
          const resolved = fileURLToPath(new URL(args.path, `file://${args.resolveDir}/`));
          if (resolved === statusAnnouncerPath || resolved === chatStatusPath) return undefined;
          return { path: args.path, namespace: "status-child-stub" };
        });
        builder.onLoad({ filter: /.*/, namespace: "status-child-stub" }, () => ({
          contents: "export default { render() { return null; } };",
          loader: "js",
        }));
      },
    },
    vuePlugin(),
  ],
});
const pairOutput = pairBuild.outputFiles.find((file) => file.path.endsWith(".cjs"));
assert.ok(pairOutput, "the real status pair compiles");
const require = createRequire(new URL("../../../package.json", import.meta.url));
const compiled = { exports: {} as { default: import("vue").Component; i18nPlugin: import("vue").Plugin } };
new Function("require", "module", "exports", pairOutput.text)(require, compiled, compiled.exports);
const vue = require("vue") as typeof import("vue");
const pairProps = vue.reactive({
  agentWorking: false,
  streamStatus: "connected",
  error: null as string | null,
});
const pairApp = vue.createApp({ render: () => vue.h(compiled.exports.default, pairProps) });
pairApp.use(compiled.exports.i18nPlugin);
pairApp.directive("tooltip", {});
const pairContainer = document.createElement("main");
document.body.append(pairContainer);
pairApp.mount(pairContainer);
const flushPair = async () => {
  await vue.nextTick();
  await Promise.resolve();
  await vue.nextTick();
};
try {
  for (const streamStatus of ["connected", "disconnected", "reconnecting"]) {
    const message = `Fixture error while ${streamStatus}`;
    pairProps.error = message;
    await flushPair();
    const announcer = pairContainer.querySelector<HTMLElement>('[data-testid="status-announcer"]');
    assert.equal(announcer?.textContent?.trim(), message, `${streamStatus} error is announced`);
    assert.equal(announcer?.getAttribute("aria-live"), "assertive");
    assert.equal(pairContainer.querySelectorAll('[role="alert"], [aria-live="assertive"]').length, 1);
    assert.equal(pairContainer.querySelector(".status-error")?.textContent?.trim(), message);
    pairProps.error = null;
    await flushPair();
  }

  pairProps.streamStatus = "reconnecting";
  await flushPair();
  assert.equal(pairContainer.querySelector('[data-testid="status-announcer"]')?.textContent?.trim(), "Reconnecting");
  pairProps.streamStatus = "disconnected";
  await flushPair();
  assert.equal(pairContainer.querySelector('[data-testid="status-announcer"]')?.textContent?.trim(), "Disconnected");
  assert.equal(pairContainer.querySelector('[data-testid="status-announcer"]')?.getAttribute("aria-live"), "assertive");
  pairProps.streamStatus = "connected";
  await flushPair();
  assert.equal(pairContainer.querySelector('[data-testid="status-announcer"]')?.textContent?.trim(), "Connected");

  pairProps.agentWorking = true;
  await flushPair();
  assert.equal(pairContainer.querySelector('[data-testid="status-announcer"]')?.textContent?.trim(), "Agent working");
  pairProps.agentWorking = false;
  await flushPair();
  assert.equal(pairContainer.querySelector('[data-testid="status-announcer"]')?.textContent?.trim(), "Agent finished");
} finally {
  pairApp.unmount();
  pairContainer.remove();
}
console.log("StatusAnnouncer + ChatStatusContent canonical announcement contract passed");
