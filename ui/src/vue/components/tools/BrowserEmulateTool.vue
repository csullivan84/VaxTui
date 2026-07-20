<!-- Vue port of components/BrowserEmulateTool.tsx. Preserves the exact DOM
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
        <span class="tool-emoji" :class="{ running: isRunning }" aria-hidden="true">📱</span>
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

      <div v-if="device" class="tool-section">
        <div class="tool-label">Device:</div>
        <pre class="tool-code">{{ device }}</pre>
      </div>

      <div v-if="input.width !== undefined && input.height !== undefined" class="tool-section">
        <div class="tool-label">Dimensions:</div>
        <pre class="tool-code">{{ input.width }} × {{ input.height }}</pre>
      </div>

      <div v-if="input.media" class="tool-section">
        <div class="tool-label">Media:</div>
        <pre class="tool-code">{{ input.media }}</pre>
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

interface EmulateInput {
  action?: string;
  device?: string;
  width?: number;
  height?: number;
  mobile?: boolean;
  touch?: boolean;
  device_scale_factor?: number;
  enabled?: boolean;
  media?: string;
}

const props = defineProps<{
  toolInput?: unknown;
  isRunning?: boolean;
  toolResult?: LLMContent[];
  hasError?: boolean;
  executionTime?: string;
}>();

const isExpanded = useToolExpanded();

const input = computed<EmulateInput>(() =>
  typeof props.toolInput === "object" && props.toolInput !== null
    ? (props.toolInput as EmulateInput)
    : {},
);

const action = computed(() => input.value.action || "");
const device = computed(() => input.value.device || "");

const output = computed(() =>
  props.toolResult && props.toolResult.length > 0 && props.toolResult[0].Text
    ? props.toolResult[0].Text
    : "",
);

const isComplete = computed(() => !props.isRunning && props.toolResult !== undefined);

const summary = computed(() => {
  const i = input.value;
  const summaryParts: string[] = [action.value];
  if (device.value) summaryParts.push(device.value);
  if (i.width && i.height) summaryParts.push(`${i.width}×${i.height}`);
  if (i.media) summaryParts.push(i.media);
  if (i.enabled !== undefined) summaryParts.push(i.enabled ? "on" : "off");
  return summaryParts.filter(Boolean).join(" ") || "emulate";
});
const outputLabel = computed(() => `Browser emulation: ${summary.value}`);
const toggleLabel = computed(() =>
  isExpanded.value
    ? `Collapse browser emulation: ${summary.value}`
    : `Expand browser emulation: ${summary.value}`,
);
const collapsedPlainText = computed(() => {
  const i = input.value;
  const parts = [`Action:\n${action.value || "(none)"}`];
  if (device.value) parts.push(`Device:\n${device.value}`);
  if (i.width !== undefined && i.height !== undefined) {
    parts.push(`Dimensions:\n${i.width} × ${i.height}`);
  }
  if (i.media) parts.push(`Media:\n${i.media}`);
  if (isComplete.value && output.value) {
    parts.push(`Output${props.hasError ? " (Error)" : ""}:\n${output.value}`);
  }
  return parts.join("\n\n");
});
</script>
