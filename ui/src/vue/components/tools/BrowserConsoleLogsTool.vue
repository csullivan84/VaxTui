<!-- Vue port of components/BrowserConsoleLogsTool.tsx. Preserves the exact DOM
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
        <span class="tool-emoji" :class="{ running: isRunning }" aria-hidden="true">📋</span>
        <span class="tool-command">{{ displayText }}</span>
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
      <div v-if="isComplete" class="tool-section">
        <div class="tool-label">
          Output{{ hasError ? " (Error)" : "" }}:
          <span v-if="executionTime" class="tool-time">{{ executionTime }}</span>
        </div>
        <pre :class="`tool-code ${hasError ? 'error' : ''}`">{{ output || "(no output)" }}</pre>
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

const props = defineProps<{
  toolName: string;
  toolInput?: unknown;
  isRunning?: boolean;
  toolInvokedAt?: string | null;
  toolResult?: LLMContent[];
  hasError?: boolean;
  executionTime?: string;
}>();

const isExpanded = useToolExpanded();

const output = computed(() =>
  props.toolResult && props.toolResult.length > 0 && props.toolResult[0].Text
    ? props.toolResult[0].Text
    : "",
);

const displayText = computed(() => {
  if (props.isRunning) {
    return props.toolName === "browser_console_clear_logs"
      ? "clearing console..."
      : "fetching console logs...";
  }
  return props.toolName === "browser_console_clear_logs" ? "clear console" : "console logs";
});

const isComplete = computed(() => !props.isRunning && props.toolResult !== undefined);
const toolDescription = computed(() =>
  props.toolName === "browser_console_clear_logs"
    ? "browser console clear"
    : "browser console logs",
);
const outputLabel = computed(() => `Output for ${toolDescription.value}`);
const toggleLabel = computed(
  () =>
    (isExpanded.value
      ? `Collapse output for ${toolDescription.value}`
      : `Expand output for ${toolDescription.value}`) +
    toolOutcomeSuffix(isComplete.value, props.hasError),
);
const collapsedPlainText = computed(() =>
  isComplete.value
    ? `Output${props.hasError ? " (Error)" : ""}:\n${output.value || "(no output)"}`
    : "",
);
</script>
