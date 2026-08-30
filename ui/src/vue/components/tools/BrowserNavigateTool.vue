<!-- Vue port of components/BrowserNavigateTool.tsx. Preserves the exact DOM
     classes, data-testid, and aria contracts the e2e tests rely on.

     shelley-a11y: URL/output stay in the a11y tree when collapsed. -->
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
        <span class="tool-emoji" :class="{ running: isRunning }" aria-hidden="true">🌐</span>
        <span class="tool-command" :title="url">{{ displayUrl }}</span>
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
      <div class="tool-section">
        <div class="tool-label">URL:</div>
        <div class="tool-code">
          <a :href="url" target="_blank" rel="noopener noreferrer">{{ url }}</a>
        </div>
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
import ToolStatusIcon from "./ToolStatusIcon.vue";

const props = defineProps<{
  toolInput?: unknown;
  isRunning?: boolean;
  toolResult?: LLMContent[];
  hasError?: boolean;
  executionTime?: string;
}>();

const isExpanded = useToolExpanded();

const url = computed(() => {
  const ti = props.toolInput;
  if (
    typeof ti === "object" &&
    ti !== null &&
    "url" in ti &&
    typeof (ti as { url: unknown }).url === "string"
  ) {
    return (ti as { url: string }).url;
  }
  return typeof ti === "string" ? ti : "";
});

const output = computed(() =>
  props.toolResult && props.toolResult.length > 0 && props.toolResult[0].Text
    ? props.toolResult[0].Text
    : "",
);

const displayUrl = computed(() => {
  const u = url.value;
  const maxLen = 300;
  return u.length <= maxLen ? u : u.substring(0, maxLen) + "...";
});

const isComplete = computed(() => !props.isRunning && props.toolResult !== undefined);
const outputLabel = computed(() => `Browser navigate for \`${displayUrl.value || "url"}\``);
const toggleLabel = computed(() =>
  isExpanded.value
    ? `Collapse browser navigate for \`${displayUrl.value || "url"}\``
    : `Expand browser navigate for \`${displayUrl.value || "url"}\``,
);
const collapsedPlainText = computed(() => {
  const parts = [`URL:\n${url.value || "(no url)"}`];
  if (isComplete.value && output.value) {
    parts.push(`Output${props.hasError ? " (Error)" : ""}:\n${output.value}`);
  }
  return parts.join("\n\n");
});
</script>
