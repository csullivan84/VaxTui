<!-- Vue port of components/SubagentTool.tsx.
     Preserves: .tool, .tool-header, .tool-summary, .tool-emoji ⚡, .tool-name,
     .tool-badge, .subagent-model-badge, .tool-error,
     .tool-success, .tool-command, .tool-toggle, .tool-details, .tool-section,
     .tool-label, .tool-code, .tool-time, .subagent-link,
     data-testid tool-call-running/completed.

     Subagent navigation: the React original navigates client-side by pushing
     `/c/{slug}` onto window.history and dispatching a popstate event (no parent
     callback prop). This port replicates that behavior verbatim in onLinkClick;
     it does not introduce a new prop or emit. -->
<template>
  <div class="tool" :data-testid="isComplete ? 'tool-call-completed' : 'tool-call-running'">
    <div
      class="tool-header"
      role="button"
      tabindex="0"
      :aria-expanded="isExpanded"
      :aria-controls="detailsId"
      :aria-label="toggleLabel"
      @click="toggleExpanded"
      @keydown.enter.prevent="toggleExpanded"
      @keydown.space.prevent="toggleExpanded"
    >
      <div class="tool-summary">
        <span class="tool-emoji" :class="{ running: isRunning }" aria-hidden="true">⚡</span>
        <span class="tool-name">subagent</span>
        <span v-if="isComplete && hasError" class="tool-error">
          <span aria-hidden="true">✗</span>
          <span class="sr-only">failed</span>
        </span>
        <span v-if="isComplete && !hasError" class="tool-success">
          <span aria-hidden="true">✓</span>
          <span class="sr-only">succeeded</span>
        </span>
        <span class="tool-command" :title="prompt">{{ commandText }}</span>
      </div>
      <button
        type="button"
        class="tool-toggle"
        tabindex="-1"
        :aria-label="toggleLabel"
        :aria-expanded="isExpanded"
        @click.stop="toggleExpanded"
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
      :plain-text="accessibleText"
      body-class="tool-details"
      :body-id="detailsId"
    >
      <div class="tool-section">
        <div class="tool-label">
          Prompt to '{{ slug }}':
          <span v-if="model" class="tool-badge subagent-model-badge">{{ model }}</span>
          <span v-if="!wait" class="tool-badge">fire-and-forget</span>
          <span v-if="timeout !== 60" class="tool-badge">timeout: {{ timeout }}s</span>
        </div>
        <div class="tool-code">{{ prompt || "(no prompt)" }}</div>
      </div>

      <div v-if="isComplete" class="tool-section">
        <div class="tool-label">
          Response:
          <span v-if="executionTime" class="tool-time">{{ executionTime }}</span>
        </div>
        <div :class="`tool-code ${hasError ? 'error' : ''}`">
          {{ resultText || "(no response)" }}
        </div>
      </div>

      <div v-if="displayData?.conversation_id" class="tool-section">
        <div class="tool-label">Conversation:</div>
        <div class="tool-code">
          <a :href="`/c/${slug}`" class="subagent-link" @click="onLinkClick">
            View subagent conversation →
          </a>
        </div>
      </div>
    </ToolAccessibleBody>

    <a
      v-if="!isExpanded && displayData?.conversation_id"
      :href="`/c/${slug}`"
      class="sr-only"
      @click="onLinkClick"
    >
      View subagent {{ slug }} conversation
    </a>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import type { LLMContent } from "../../../types";
import { useToolExpanded } from "../../composables/toolDetail";
import ToolAccessibleBody from "./ToolAccessibleBody.vue";

interface SubagentInput {
  slug?: string;
  prompt?: string;
  model?: string;
  timeout_seconds?: number;
  wait?: boolean;
}

const props = defineProps<{
  toolInput?: unknown;
  isRunning?: boolean;
  toolResult?: LLMContent[];
  hasError?: boolean;
  executionTime?: string;
  displayData?: { slug?: string; conversation_id?: string; status?: string };
}>();

const isExpanded = useToolExpanded();
const detailsId = `subagent-details-${useId()}`;

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
}

const input = computed<SubagentInput>(() =>
  typeof props.toolInput === "object" && props.toolInput !== null
    ? (props.toolInput as SubagentInput)
    : {},
);

const slug = computed(() => input.value.slug || props.displayData?.slug || "subagent");
const prompt = computed(() => input.value.prompt || "");
const model = computed(() => input.value.model || "");
const wait = computed(() => input.value.wait !== false);
const timeout = computed(() => input.value.timeout_seconds || 60);

// Extract result text
const resultText = computed(
  () =>
    props.toolResult
      ?.filter((r) => r.Type === 2) // ContentTypeText
      .map((r) => r.Text)
      .join("\n") || "",
);

// Truncate prompt for display
const truncateText = (text: string, maxLen = 60) => {
  if (!text) return "";
  const firstLine = text.split("\n")[0];
  if (firstLine.length <= maxLen) return firstLine;
  return firstLine.substring(0, maxLen) + "...";
};

const displayPrompt = computed(() => truncateText(prompt.value));
const isComplete = computed(() => !props.isRunning && props.toolResult !== undefined);

// Mirror the React JSX text exactly:
//   Subagent '{slug}'{model ? ` (${model})` : ""}{" "}
//   {isRunning ? (wait ? "running..." : "started") : ""}
//   {displayPrompt && !isRunning && ` ${displayPrompt}`}
const commandText = computed(() => {
  let s = `Subagent '${slug.value}'`;
  if (model.value) s += ` (${model.value})`;
  s += " ";
  s += props.isRunning ? (wait.value ? "running..." : "started") : "";
  if (displayPrompt.value && !props.isRunning) s += ` ${displayPrompt.value}`;
  return s;
});

const outputLabel = computed(() => `Subagent details for ${slug.value}`);
const toggleLabel = computed(() =>
  isExpanded.value
    ? `Collapse subagent details for ${slug.value}`
    : `Expand subagent details for ${slug.value}`,
);
const accessibleText = computed(() => {
  const badges: string[] = [];
  if (model.value) badges.push(`Model: ${model.value}`);
  if (!wait.value) badges.push("Fire-and-forget");
  if (timeout.value !== 60) badges.push(`Timeout: ${timeout.value} seconds`);

  const parts = [`Prompt to ${slug.value}:\n${prompt.value || "(no prompt)"}`];
  if (badges.length > 0) parts.push(badges.join("\n"));
  if (isComplete.value) {
    parts.push(`Response${props.hasError ? " (Error)" : ""}:\n${resultText.value || "(no response)"}`);
  }
  return parts.join("\n\n");
});

function onLinkClick(e: MouseEvent) {
  // Let the browser handle cmd/ctrl/shift/middle-click (open in new tab/window).
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  // Navigate to the subagent conversation
  window.history.pushState({}, "", `/c/${slug.value}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
</script>
