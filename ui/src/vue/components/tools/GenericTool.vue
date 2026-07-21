<!-- Vue port of components/GenericTool.tsx. Fallback tool renderer.
     Preserves: .tool, .tool-header, .tool-summary, .tool-emoji, .tool-command,
     .tool-toggle, .tool-details, .tool-section, .tool-label, .tool-code,
     .tool-error, .tool-success, data-testid tool-call-running/completed.

     shelley-a11y: collapsed body keeps output in the a11y tree. -->
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
        <span class="tool-emoji" :class="{ running: isRunning }" aria-hidden="true">⚙️</span>
        <span class="tool-command">{{ toolName }}</span>
        <span v-if="isComplete && hasError" class="tool-error">
          <span aria-hidden="true">✗</span>
          <span class="sr-only">failed</span>
        </span>
        <span v-if="isComplete && !hasError" class="tool-success">
          <span aria-hidden="true">✓</span>
          <span class="sr-only">succeeded</span>
        </span>
      </div>
      <button
        type="button"
        class="tool-toggle"
        tabindex="-1"
        :aria-label="toggleLabel"
        :aria-expanded="isExpanded"
        @click.stop="isExpanded = !isExpanded"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          class="tool-chevron"
          :class="{ 'tool-chevron-expanded': isExpanded }"
          aria-hidden="true"
        >
          <path
            d="M4.5 3L7.5 6L4.5 9"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <ToolAccessibleBody
      :expanded="isExpanded"
      :label="outputLabel"
      :plain-text="collapsedPlainText"
      body-class="tool-details"
    >
      <div v-if="toolInput !== undefined" class="tool-section">
        <div class="tool-label">Input:</div>
        <pre class="tool-code">{{ formatData(toolInput) }}</pre>
      </div>

      <div v-if="isRunning" class="tool-section">
        <div class="tool-label">Status:</div>
        <div class="tool-running-text">running...</div>
      </div>

      <div v-if="isComplete" class="tool-section">
        <div class="tool-label">
          Output{{ hasError ? " (Error)" : "" }}:
          <span v-if="executionTime" class="tool-time">{{ executionTime }}</span>
        </div>
        <ul v-if="outputAsRows" class="tool-code tool-json-rows" :class="{ error: hasError }">
          <li v-for="(row, i) in outputAsRows" :key="i">{{ row }}</li>
        </ul>
        <pre v-else :class="`tool-code ${hasError ? 'error' : ''}`">{{ output || "(no output)" }}</pre>
      </div>
    </ToolAccessibleBody>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import type { LLMContent } from "../../../types";
import { announceToolA11y } from "../../../services/a11yAnnouncer";
import { useToolExpanded } from "../../composables/toolDetail";
import ToolAccessibleBody from "./ToolAccessibleBody.vue";

const props = defineProps<{
  toolName: string;
  toolInput?: unknown;
  isRunning?: boolean;
  toolResult?: LLMContent[];
  hasError?: boolean;
  executionTime?: string;
}>();

const isExpanded = useToolExpanded();

const formatData = (data: unknown): string => {
  if (data === undefined || data === null) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
};

const output = computed(() =>
  props.toolResult && props.toolResult.length > 0
    ? props.toolResult.map((result) => result.Text || formatData(result)).join("\n")
    : "",
);

/** Prefer list-of-rows when output is a JSON array of objects/scalars (rotor-friendly). */
const outputAsRows = computed((): string[] | null => {
  const raw = output.value.trim();
  if (!raw.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 200) return null;
    return parsed.map((item, i) => {
      if (item === null || typeof item !== "object") return `${i + 1}. ${String(item)}`;
      return `${i + 1}. ${JSON.stringify(item)}`;
    });
  } catch {
    return null;
  }
});

const isComplete = computed(() => !props.isRunning && props.toolResult !== undefined);

const outputLabel = computed(() => `Tool output for ${props.toolName}`);
const toggleLabel = computed(() =>
  isExpanded.value
    ? `Collapse tool output for ${props.toolName}`
    : `Expand tool output for ${props.toolName}`,
);

const collapsedPlainText = computed(() => {
  if (!isComplete.value) return "";
  const parts: string[] = [];
  if (props.toolInput !== undefined) {
    parts.push(`Input:\n${formatData(props.toolInput)}`);
  }
  parts.push(`Output${props.hasError ? " (Error)" : ""}:\n${output.value || "(no output)"}`);
  return parts.join("\n\n");
});

watch(
  () => [props.isRunning, props.toolResult] as const,
  ([running, result], prev) => {
    const wasRunning = prev?.[0];
    if (wasRunning && !running && result !== undefined) {
      void announceToolA11y(
        props.toolName,
        props.hasError ? `Tool failed: ${props.toolName}` : `Tool finished: ${props.toolName}`,
      );
    }
  },
);
</script>
