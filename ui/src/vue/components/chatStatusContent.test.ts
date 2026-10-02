import assert from "node:assert/strict";
import { mountVueComponent } from "../../../scripts/vue-component-test";

const noOp = () => {};
let dismissed = 0;
const base = {
  conversationId: "fixture-conversation",
  streamStatus: "connected",
  error: "Fixture send failed",
  agentWorking: false,
  interrupted: false,
  resumingInterrupted: false,
  cancelling: false,
  selectedCwd: "/fixture",
  contextWindowSize: 0,
  maxContextTokens: 0,
  usageEntries: [],
  otherUsageRows: [],
  messages: [],
  hostname: "fixture",
  models: [],
  selectedModel: "predictable",
  sending: false,
  refreshingModels: false,
  thinkingLevel: "default",
  toolOverrides: {},
  toolOverrideList: [],
  toolOverrideCount: 0,
  cwdError: null,
  onUnarchive: noOp,
  onClearError: () => dismissed++,
  onCancel: noOp,
  onResumeInterrupted: noOp,
  onStartNewGeneration: noOp,
  onSelectModel: noOp,
  onSelectCombination: noOp,
  onSwitchConversationModel: noOp,
  onSwitchConversationCombination: noOp,
  onSwitchConversationThinkingLevel: noOp,
  onManageModels: noOp,
  onRefreshModels: noOp,
  onThinkingChange: noOp,
  onSetToolOverride: noOp,
  onResetToolOverrides: noOp,
  onOpenDirectoryPicker: noOp,
  onUsageNeeded: noOp,
};

const fixture = await mountVueComponent("src/vue/components/ChatStatusContent.vue", base);
try {
  for (const streamStatus of ["connected", "disconnected", "reconnecting"]) {
    fixture.props.streamStatus = streamStatus;
    await fixture.flush();
    const alert = fixture.container.querySelector('[role="alert"]');
    assert.equal(
      alert?.textContent?.trim(),
      "Fixture send failed",
      `${streamStatus} error stays visible`,
    );
    const dismiss = fixture.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss error"]',
    );
    assert.ok(dismiss, "the error has a reachable named dismiss button");
    dismiss.click();
  }
  assert.equal(dismissed, 3, "dismiss routes to the supplied action");
  fixture.props.error = null;
  fixture.props.streamStatus = "connected";
  fixture.props.interrupted = true;
  await fixture.flush();
  const interrupted = fixture.container.querySelector('[data-testid="conversation-interrupted"]');
  assert.equal(
    interrupted?.getAttribute("role"),
    "status",
    "interrupted state has status semantics",
  );
  assert.match(interrupted?.textContent ?? "", /Conversation Interrupted/);
  assert.match(interrupted?.textContent ?? "", /Continue/);
} finally {
  fixture.close();
}
console.log("ChatStatusContent rendered error/dismiss/interruption contracts passed");
