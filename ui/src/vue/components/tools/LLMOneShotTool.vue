<!-- Vue port of components/LLMOneShotTool.tsx.
     Preserves: .tool, .tool-header, .tool-summary, .tool-emoji 🤖, .tool-name,
     .tool-command, .tool-toggle, .tool-details, .tool-section, .tool-label,
     .tool-code, .tool-time, .tool-error, .tool-success,
     data-testid tool-call-running/completed. -->
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
        <span class="tool-emoji" :class="{ running: isRunning }" aria-hidden="true">🤖</span>
        <span class="tool-name">llm_one_shot</span>
        <span v-if="isComplete && hasError" class="tool-error">
          <span aria-hidden="true">✗</span><span class="sr-only">failed</span>
        </span>
        <span v-if="isComplete && !hasError" class="tool-success">
          <span aria-hidden="true">✓</span><span class="sr-only">succeeded</span>
        </span>
        <span class="tool-command">{{ summary }}</span>
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
      <div class="tool-section">
        <div class="tool-label">Prompt file:</div>
        <pre class="tool-code">{{ promptFile || "(none)" }}</pre>
      </div>

      <div v-if="model" class="tool-section">
        <div class="tool-label">Model:</div>
        <pre class="tool-code">{{ model }}</pre>
      </div>

      <div v-if="input.system_prompt" class="tool-section">
        <div class="tool-label">System prompt:</div>
        <pre class="tool-code">{{ input.system_prompt }}</pre>
      </div>

      <div v-if="input.output_file" class="tool-section">
        <div class="tool-label">Output file:</div>
        <pre class="tool-code">{{ input.output_file }}</pre>
      </div>

      <div v-if="isComplete" class="tool-section">
        <div class="tool-label">
          Result{{ hasError ? " (Error)" : "" }}:
          <span v-if="executionTime" class="tool-time">{{ executionTime }}</span>
        </div>
        <pre :class="`tool-code ${hasError ? 'error' : ''}`">{{ resultText || "(no output)" }}</pre>
      </div>
    </ToolAccessibleBody>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { LLMContent } from "../../../types";
import { useToolExpanded } from "../../composables/toolDetail";
import ToolAccessibleBody from "./ToolAccessibleBody.vue";

interface LLMOneShotInput {
  prompt_file?: string;
  output_file?: string;
  model?: string;
  system_prompt?: string;
}

const props = defineProps<{
  toolInput?: unknown;
  isRunning?: boolean;
  toolResult?: LLMContent[];
  hasError?: boolean;
  executionTime?: string;
}>();

const isExpanded = useToolExpanded();

const input = computed<LLMOneShotInput>(() =>
  typeof props.toolInput === "object" && props.toolInput !== null
    ? (props.toolInput as LLMOneShotInput)
    : {},
);

const promptFile = computed(() => input.value.prompt_file || "");
const model = computed(() => input.value.model || "");

const resultText = computed(
  () =>
    props.toolResult
      ?.filter((r) => r.Type === 2)
      .map((r) => r.Text)
      .join("\n") || "",
);

const isComplete = computed(() => !props.isRunning && props.toolResult !== undefined);

const summary = computed(() => {
  const parts: string[] = [];
  if (promptFile.value) parts.push(promptFile.value);
  if (model.value) parts.push(`model: ${model.value}`);
  return parts.join(" · ") || "llm_one_shot";
});
const outputLabel = computed(() => "LLM one-shot result");
const toggleLabel = computed(() =>
  isExpanded.value ? "Collapse LLM one-shot result" : "Expand LLM one-shot result",
);
const collapsedPlainText = computed(() => {
  const parts = [`Prompt file:\n${promptFile.value || "(none)"}`];
  if (model.value) parts.push(`Model:\n${model.value}`);
  if (input.value.system_prompt) parts.push(`System prompt:\n${input.value.system_prompt}`);
  if (input.value.output_file) parts.push(`Output file:\n${input.value.output_file}`);
  if (isComplete.value) {
    parts.push(`Result${props.hasError ? " (Error)" : ""}:\n${resultText.value || "(no output)"}`);
  }
  return parts.join("\n\n");
});
</script>
