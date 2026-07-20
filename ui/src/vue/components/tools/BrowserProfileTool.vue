<!-- Vue port of components/BrowserProfileTool.tsx. Preserves the exact DOM
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
        <span class="tool-emoji" :class="{ running: isRunning }" aria-hidden="true">📊</span>
        <span class="tool-command">{{ summary }}</span>
        <span v-if="isComplete && hasError" class="tool-error">
          <span aria-hidden="true">✗</span><span class="sr-only">failed</span>
        </span>
        <span v-if="isComplete && !hasError" class="tool-success">
          <span aria-hidden="true">✓</span><span class="sr-only">succeeded</span>
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
      <div class="tool-section">
        <div class="tool-label">Action:</div>
        <pre class="tool-code">{{ action || "(none)" }}</pre>
      </div>

      <div v-if="input.categories" class="tool-section">
        <div class="tool-label">Categories:</div>
        <pre class="tool-code">{{ input.categories }}</pre>
      </div>

      <div v-if="isComplete && output" class="tool-section">
        <div class="tool-label">
          Output{{ hasError ? " (Error)" : "" }}:
          <span v-if="executionTime" class="tool-time">{{ executionTime }}</span>
        </div>
        <pre :class="`tool-code ${hasError ? 'error' : ''}`">{{ output }}</pre>
      </div>

      <div v-if="isComplete && savedFilePath && !hasError" class="tool-section">
        <div class="tool-label">Profile/Trace file:</div>
        <div class="profile-file-wrapper">
          <code class="profile-file-path">{{ savedFilePath }}</code>
          <button type="button" class="profile-copy-button" @click="handleCopyPath">
            <span aria-hidden="true">{{ copied ? "✓" : "📋" }}</span>
            {{ copied ? "Copied" : "Copy path" }}
          </button>
          <a
            v-if="action === 'cpu_stop' || action === 'trace_stop'"
            :href="speedscopeUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="profile-speedscope-link"
            @click.stop
          >
            <span aria-hidden="true">🔥</span> Open in Speedscope
          </a>
        </div>
      </div>
    </ToolAccessibleBody>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { LLMContent } from "../../../types";
import { useToolExpanded } from "../../composables/toolDetail";
import ToolAccessibleBody from "./ToolAccessibleBody.vue";

interface ProfileInput {
  action?: string;
  categories?: string;
}

const props = defineProps<{
  toolInput?: unknown;
  isRunning?: boolean;
  toolResult?: LLMContent[];
  hasError?: boolean;
  executionTime?: string;
}>();

const isExpanded = useToolExpanded();
const copied = ref(false);

const input = computed<ProfileInput>(() =>
  typeof props.toolInput === "object" && props.toolInput !== null
    ? (props.toolInput as ProfileInput)
    : {},
);

const action = computed(() => input.value.action || "");

const output = computed(() =>
  props.toolResult && props.toolResult.length > 0 && props.toolResult[0].Text
    ? props.toolResult[0].Text
    : "",
);

const isComplete = computed(() => !props.isRunning && props.toolResult !== undefined);

// Detect file paths in output (for cpu_stop, trace_stop results)
const savedFilePath = computed<string | null>(() => {
  const filePathMatch = output.value.match(/([^\s]+\.json)/i);
  return filePathMatch ? filePathMatch[1] : null;
});

const summary = computed(() => action.value || "profile");

const speedscopeUrl = computed(() =>
  savedFilePath.value
    ? `https://www.speedscope.app/#profileURL=${encodeURIComponent(window.location.origin + "/api/read?path=" + encodeURIComponent(savedFilePath.value))}`
    : "",
);
const outputLabel = computed(() => `Browser profile: ${summary.value}`);
const toggleLabel = computed(() =>
  isExpanded.value
    ? `Collapse browser profile: ${summary.value}`
    : `Expand browser profile: ${summary.value}`,
);
const collapsedPlainText = computed(() => {
  const parts = [`Action:\n${action.value || "(none)"}`];
  if (input.value.categories) parts.push(`Categories:\n${input.value.categories}`);
  if (isComplete.value && output.value) {
    parts.push(`Output${props.hasError ? " (Error)" : ""}:\n${output.value}`);
  }
  if (isComplete.value && savedFilePath.value && !props.hasError) {
    parts.push(`Profile/Trace file:\n${savedFilePath.value}`);
    if (action.value === "cpu_stop" || action.value === "trace_stop") {
      parts.push(`Open in Speedscope:\n${speedscopeUrl.value}`);
    }
  }
  return parts.join("\n\n");
});

function handleCopyPath(e: MouseEvent) {
  e.stopPropagation();
  if (savedFilePath.value) {
    navigator.clipboard.writeText(savedFilePath.value).then(() => {
      copied.value = true;
      setTimeout(() => (copied.value = false), 2000);
    });
  }
}
</script>
