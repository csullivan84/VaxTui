<!-- Vue port of components/KeywordSearchTool.tsx.
     Preserves: .tool, .tool-header, .tool-summary, .tool-emoji 🔍, .tool-command,
     .tool-toggle, .tool-details, .tool-section, .tool-label, .tool-code,
     .tool-time, .tool-error, .tool-success, data-testid tool-call-running/completed.

     shelley-a11y: collapsed results stay in the a11y tree. -->
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
        <span class="tool-emoji" :class="{ running: isRunning }" aria-hidden="true">🔍</span>
        <span class="tool-command" :title="fullText">{{ displayText }}</span>
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
      <div v-if="query" class="tool-section">
        <div class="tool-label">Query:</div>
        <pre class="tool-code">{{ query }}</pre>
      </div>

      <div v-if="searchTerms.length > 0" class="tool-section">
        <div class="tool-label">Search Terms:</div>
        <pre class="tool-code">{{ searchTerms.join(", ") }}</pre>
      </div>

      <div v-if="isComplete" class="tool-section">
        <div class="tool-label">
          Results{{ hasError ? " (Error)" : "" }}:
          <span v-if="executionTime" class="tool-time">{{ executionTime }}</span>
        </div>
        <pre :class="`tool-code ${hasError ? 'error' : ''}`">{{ output || "(no output)" }}</pre>
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
  toolInput?: unknown;
  isRunning?: boolean;
  toolResult?: LLMContent[];
  hasError?: boolean;
  executionTime?: string;
}>();

const isExpanded = useToolExpanded();

const query = computed(() => {
  const ti = props.toolInput;
  if (
    typeof ti === "object" &&
    ti !== null &&
    "query" in ti &&
    typeof (ti as { query: unknown }).query === "string"
  ) {
    return (ti as { query: string }).query;
  }
  return "";
});

const searchTerms = computed<string[]>(() => {
  const ti = props.toolInput;
  if (
    typeof ti === "object" &&
    ti !== null &&
    "search_terms" in ti &&
    Array.isArray((ti as { search_terms: unknown }).search_terms)
  ) {
    return (ti as { search_terms: string[] }).search_terms;
  }
  return [];
});

const output = computed(() =>
  props.toolResult && props.toolResult.length > 0 && props.toolResult[0].Text
    ? props.toolResult[0].Text
    : "",
);

const truncateSearchTerms = (terms: string[], maxLen = 300) => {
  const joined = terms.join(", ");
  if (joined.length <= maxLen) return joined;
  return joined.substring(0, maxLen) + "...";
};

const fullText = computed(() => query.value || searchTerms.value.join(", "));
const displayText = computed(() => query.value || truncateSearchTerms(searchTerms.value));
const isComplete = computed(() => !props.isRunning && props.toolResult !== undefined);

const searchSubject = computed(() => fullText.value || "keyword search");
const outputLabel = computed(() => `Search results for \`${searchSubject.value}\``);
const toggleLabel = computed(() =>
  isExpanded.value
    ? `Collapse search results for \`${searchSubject.value}\``
    : `Expand search results for \`${searchSubject.value}\``,
);

const collapsedPlainText = computed(() => {
  if (!isComplete.value) return "";
  const parts: string[] = [];
  if (query.value) parts.push(`Query:\n${query.value}`);
  if (searchTerms.value.length) parts.push(`Search Terms:\n${searchTerms.value.join(", ")}`);
  parts.push(`Results${props.hasError ? " (Error)" : ""}:\n${output.value || "(no output)"}`);
  return parts.join("\n\n");
});

watch(
  () => [props.isRunning, props.toolResult] as const,
  ([running, result], prev) => {
    if (prev?.[0] && !running && result !== undefined) {
      void announceToolA11y(
        "keyword",
        props.hasError
          ? `Search failed: ${searchSubject.value}`
          : `Search finished: ${searchSubject.value}`,
      );
    }
  },
);
</script>
