<!-- Vue port of components/BashTool.tsx. Preserves the exact DOM classes and
     data-testid contract the e2e tests rely on (.bash-tool,
     .bash-tool-command, .bash-tool-code, .bash-tool-details,
     .bash-tool-header, .bash-tool-cancelled, tool-call-running/completed).

     a11y (shelley-a11y fork): terminal output stays in the accessibility tree
     when visually collapsed (sr-only region), with clear labels, navigable
     <pre> line breaks, completion announcements, and optional screen-reader
     mode that keeps tool bodies expanded. -->
<template>
  <div class="bash-tool" :data-testid="isComplete ? 'tool-call-completed' : 'tool-call-running'">
    <div
      class="bash-tool-header"
      role="button"
      tabindex="0"
      :aria-expanded="isExpanded"
      :aria-controls="detailsId"
      :aria-label="toggleLabel"
      @click="toggleExpanded"
      @keydown.enter.prevent="toggleExpanded"
      @keydown.space.prevent="toggleExpanded"
    >
      <div class="bash-tool-summary">
        <span class="bash-tool-emoji" :class="{ running: isRunning }" aria-hidden="true">🛠️</span>
        <span class="bash-tool-command" :title="command">{{ displayCommand }}</span>
        <span v-if="displayData?.workingDir" class="bash-tool-cwd" :title="displayData.workingDir">
          in {{ displayData.workingDir }}
        </span>
        <span v-if="isComplete && isCancelled" class="bash-tool-cancelled">
          <span aria-hidden="true">✗</span>
          cancelled
        </span>
        <span v-if="isComplete && hasError && !isCancelled" class="bash-tool-error">
          <span aria-hidden="true">✗</span>
          <span class="sr-only">failed</span>
        </span>
        <span v-if="isComplete && !hasError" class="bash-tool-success">
          <span aria-hidden="true">✓</span>
          <span class="sr-only">succeeded</span>
        </span>
      </div>
      <button
        type="button"
        class="bash-tool-toggle"
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

    <!-- Streaming preview — shown below header while running, outside details. -->
    <div v-if="isRunning && streamingOutput && !isExpanded" class="bash-tool-preview">
      <AnsiText ref="previewRef" class-name="bash-tool-preview-code" :text="visibleStreaming" />
      <button
        v-if="hasMoreLines && !previewExpanded"
        type="button"
        class="bash-tool-preview-more"
        @click.stop="previewExpanded = true"
      >
        Show all {{ lineCount }} lines
      </button>
    </div>

    <!--
      When visually collapsed, keep completed output in the a11y tree via
      .sr-only so VoiceOver can still navigate lines. Sighted users only see
      the header until they expand. Screen-reader mode always expands.
    -->
    <div
      v-if="isComplete && !isExpanded"
      class="sr-only"
      role="region"
      :aria-label="outputLabel"
      data-testid="bash-tool-output-sr"
    >
      <pre class="bash-tool-code">{{ accessibleOutput }}</pre>
    </div>

    <div
      v-show="isExpanded"
      :id="detailsId"
      class="bash-tool-details"
      role="region"
      :aria-label="outputLabel"
      data-testid="bash-tool-details"
    >
      <div v-if="displayData?.workingDir" class="bash-tool-section">
        <div class="bash-tool-label" :id="cwdLabelId">Working Directory:</div>
        <pre class="bash-tool-code bash-tool-code-cwd" :aria-labelledby="cwdLabelId">{{
          displayData.workingDir
        }}</pre>
      </div>
      <div class="bash-tool-section">
        <div class="bash-tool-label" :id="commandLabelId">Command:</div>
        <pre class="bash-tool-code" :aria-labelledby="commandLabelId">{{ command }}</pre>
      </div>

      <div v-if="isRunning && streamingOutput" class="bash-tool-section">
        <div class="bash-tool-label" :id="streamLabelId">Output (streaming):</div>
        <AnsiText
          ref="expandedStreamRef"
          class-name="bash-tool-code bash-tool-streaming"
          :text="streamingOutput"
          :aria-labelledby="streamLabelId"
        />
      </div>

      <div v-if="isComplete" class="bash-tool-section">
        <div class="bash-tool-label" :id="outputLabelId">
          {{ hasError ? "Output (Error)" : "Output" }}:
          <span v-if="executionTime" class="bash-tool-time">{{ executionTime }}</span>
        </div>
        <AnsiText
          :class-name="`bash-tool-code ${hasError ? 'error' : ''}`"
          :text="output || '(no output)'"
          :aria-labelledby="outputLabelId"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, useId } from "vue";
import type { LLMContent } from "../../../types";
import AnsiText from "./AnsiText.vue";
import { useToolExpanded, useInToolDetail } from "../../composables/toolDetail";
import { useScreenReaderMode } from "../../composables/screenReaderMode";
import { announceToolA11y } from "../../../services/a11yAnnouncer";
import {
  bashCompletionAnnouncement,
  completionKind,
  terminalOutputLabel,
  terminalToggleLabel,
} from "./bashToolA11y";

interface BashDisplayData {
  workingDir: string;
}

const props = defineProps<{
  toolInput?: unknown;
  isRunning?: boolean;
  toolResult?: LLMContent[];
  hasError?: boolean;
  executionTime?: string;
  display?: unknown;
  streamingOutput?: string;
}>();

/** Max lines shown in the streaming preview before "Show more" is needed. */
const PREVIEW_LINES = 5;

const uid = useId();
const detailsId = `bash-details-${uid}`;
const cwdLabelId = `bash-cwd-label-${uid}`;
const commandLabelId = `bash-cmd-label-${uid}`;
const streamLabelId = `bash-stream-label-${uid}`;
const outputLabelId = `bash-out-label-${uid}`;

const { screenReaderMode } = useScreenReaderMode();

// Details panel — collapsed by default (expanded inside the detail modal, or SR mode).
const isExpanded = useToolExpanded();
if (screenReaderMode.value) {
  isExpanded.value = true;
}
// Streaming preview — expanded to show full streaming output.
const previewExpanded = ref(false);
const previewRef = ref<InstanceType<typeof AnsiText> | null>(null);
const expandedStreamRef = ref<InstanceType<typeof AnsiText> | null>(null);
const inToolDetail = useInToolDetail();

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
}

// Collapse details when the tool completes (skip inside detail modal / SR mode).
watch(
  () => props.isRunning,
  (running, prevRunning) => {
    if (prevRunning && !running && !inToolDetail && !screenReaderMode.value) {
      isExpanded.value = false;
      previewExpanded.value = false;
    }
    if (prevRunning && !running && screenReaderMode.value) {
      isExpanded.value = true;
    }
  },
);

// Prefer expanded when user turns on screen-reader mode mid-session.
watch(screenReaderMode, (on) => {
  if (on) isExpanded.value = true;
});

// Announce completion once via the app-level live region (not a per-card
// role=status that would linger in the transcript for Safari VO Shift+Tab).
watch(
  () => [props.isRunning, props.toolResult] as const,
  ([running, result], prev) => {
    const wasRunning = prev?.[0];
    if (wasRunning && !running && result !== undefined) {
      const kind = completionKind(props.hasError, isCancelled.value);
      void announceToolA11y("bash", bashCompletionAnnouncement(command.value, kind));
    }
  },
);

// Auto-scroll streaming output to bottom (whichever ref is active).
watch(
  () => props.streamingOutput,
  async (out) => {
    if (!out) return;
    await nextTick();
    const el = previewRef.value?.preEl ?? expandedStreamRef.value?.preEl;
    if (el) el.scrollTop = el.scrollHeight;
  },
);

const displayData = computed<BashDisplayData | null>(() => {
  const d = props.display;
  if (
    d &&
    typeof d === "object" &&
    "workingDir" in d &&
    typeof (d as BashDisplayData).workingDir === "string"
  ) {
    return d as BashDisplayData;
  }
  return null;
});

const command = computed(() => {
  const ti = props.toolInput;
  if (
    typeof ti === "object" &&
    ti !== null &&
    "command" in ti &&
    typeof (ti as { command: unknown }).command === "string"
  ) {
    return (ti as { command: string }).command;
  }
  return typeof ti === "string" ? ti : "";
});

const output = computed(() =>
  props.toolResult && props.toolResult.length > 0 && props.toolResult[0].Text
    ? props.toolResult[0].Text
    : "",
);

const accessibleOutput = computed(() => output.value || "(no output)");

const isCancelled = computed(
  () => props.hasError && output.value.includes("Tool execution cancelled by user"),
);

const displayCommand = computed(() => {
  const cmd = command.value;
  const maxLen = 300;
  return cmd.length <= maxLen ? cmd : cmd.substring(0, maxLen) + "...";
});

const isComplete = computed(() => !props.isRunning && props.toolResult !== undefined);

const outputLabel = computed(() => terminalOutputLabel(command.value));
const toggleLabel = computed(() => terminalToggleLabel(isExpanded.value, command.value));

const visibleStreaming = computed(() => {
  if (!props.streamingOutput) return "";
  const lines = props.streamingOutput.split("\n");
  return previewExpanded.value ? props.streamingOutput : lines.slice(-PREVIEW_LINES).join("\n");
});
const hasMoreLines = computed(
  () => !!props.streamingOutput && props.streamingOutput.split("\n").length > PREVIEW_LINES,
);
const lineCount = computed(() =>
  props.streamingOutput ? props.streamingOutput.split("\n").length : 0,
);
</script>
