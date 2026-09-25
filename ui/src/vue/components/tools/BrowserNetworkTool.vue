<!-- Vue port of components/BrowserNetworkTool.tsx. Preserves the exact DOM
     classes, data-testid, and aria contracts the e2e tests rely on. -->
<template>
  <div class="tool" :data-testid="isComplete ? 'tool-call-completed' : 'tool-call-running'">
    <div
      class="tool-header"
      role="button"
      tabindex="0"
      :aria-expanded="isExpanded"
      :aria-label="toggleLabel"
      @click="isExpanded = !isExpanded"
      @keydown.enter.prevent="isExpanded = !isExpanded"
      @keydown.space.prevent="isExpanded = !isExpanded"
    >
      <div class="tool-summary">
        <span class="tool-emoji" :class="{ running: isRunning }" aria-hidden="true">📡</span>
        <span class="tool-command">{{ summary }}</span>
        <ToolStatusIcon v-if="isComplete && hasError" state="error" class="tool-error" />
        <ToolStatusIcon v-if="isComplete && !hasError" state="ok" class="tool-success" />
      </div>
      <button
        type="button"
        class="tool-toggle"
        tabindex="-1"
        :aria-label="toggleLabel"
        :aria-expanded="isExpanded"
        @click.stop="isExpanded = !isExpanded"
      >
        <ToolChevron :expanded="isExpanded" />
      </button>
    </div>

    <ToolAccessibleBody
      :expanded="isExpanded"
      :label="outputLabel"
      :plain-text="collapsedPlainText"
      body-class="tool-details"
    >
      <RunningToolTime v-if="isRunning && isExpanded" :start-time="toolInvokedAt" />
      <div class="tool-section">
        <div class="tool-label">Action:</div>
        <pre class="tool-code">{{ action || "(none)" }}</pre>
      </div>

      <div v-if="input.filter" class="tool-section">
        <div class="tool-label">Filter:</div>
        <pre class="tool-code">{{ input.filter }}</pre>
      </div>

      <div v-if="input.limit !== undefined" class="tool-section">
        <div class="tool-label">Limit:</div>
        <pre class="tool-code">{{ input.limit }}</pre>
      </div>

      <div v-if="isComplete && output" class="tool-section">
        <div class="tool-label">
          Output{{ hasError ? " (Error)" : "" }}:
          <span v-if="executionTime" class="tool-time">{{ executionTime }}</span>
        </div>
        <pre :class="`tool-code ${hasError ? 'error' : ''}`">{{ output }}</pre>
      </div>
    </ToolAccessibleBody>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { LLMContent } from "../../../types";
import { useToolExpanded } from "../../composables/toolDetail";
import ToolAccessibleBody from "./ToolAccessibleBody.vue";
import ToolChevron from "./ToolChevron.vue";
import RunningToolTime from "./RunningToolTime.vue";
import ToolStatusIcon from "./ToolStatusIcon.vue";
import { toolOutcomeSuffix } from "../../utils/toolStatus";

interface NetworkInput {
  action?: string;
  filter?: string;
  limit?: number;
}

const props = defineProps<{
  toolInput?: unknown;
  isRunning?: boolean;
  toolInvokedAt?: string | null;
  toolResult?: LLMContent[];
  hasError?: boolean;
  executionTime?: string;
}>();

const isExpanded = useToolExpanded();

const input = computed<NetworkInput>(() =>
  typeof props.toolInput === "object" && props.toolInput !== null
    ? (props.toolInput as NetworkInput)
    : {},
);

const action = computed(() => input.value.action || "");

const output = computed(() =>
  props.toolResult && props.toolResult.length > 0 && props.toolResult[0].Text
    ? props.toolResult[0].Text
    : "",
);

const isComplete = computed(() => !props.isRunning && props.toolResult !== undefined);

const summary = computed(() => {
  const summaryParts: string[] = [action.value];
  if (input.value.filter) summaryParts.push(`filter: ${input.value.filter}`);
  return summaryParts.filter(Boolean).join(" ") || "network";
});
const outputLabel = computed(() => `Browser network: ${summary.value}`);
const toggleLabel = computed(
  () =>
    (isExpanded.value
      ? `Collapse browser network: ${summary.value}`
      : `Expand browser network: ${summary.value}`) +
    toolOutcomeSuffix(isComplete.value, props.hasError),
);
const collapsedPlainText = computed(() => {
  const parts = [`Action:\n${action.value || "(none)"}`];
  if (input.value.filter) parts.push(`Filter:\n${input.value.filter}`);
  if (input.value.limit !== undefined) parts.push(`Limit:\n${input.value.limit}`);
  if (isComplete.value && output.value) {
    parts.push(`Output${props.hasError ? " (Error)" : ""}:\n${output.value}`);
  }
  return parts.join("\n\n");
});
</script>
