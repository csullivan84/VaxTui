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
        <HighlightedCode
          class="bash-tool-command"
          :source="displayCommand"
          language="shellscript"
          :title="command"
        />
        <span v-if="displayData?.workingDir" class="bash-tool-cwd" :title="displayData.workingDir">
          in {{ displayData.workingDir }}
        </span>
        <span v-if="isComplete && isCancelled" class="bash-tool-cancelled">
          <span aria-hidden="true">✗</span>
          cancelled
        </span>
        <ToolStatusIcon
          v-if="isComplete && hasError && !isCancelled"
          state="error"
          class="bash-tool-error"
        />
        <ToolStatusIcon v-if="isComplete && !hasError" state="ok" class="bash-tool-success" />
      </div>
      <button
        type="button"
        class="bash-tool-toggle"
        tabindex="-1"
        :aria-label="toggleLabel"
        :aria-expanded="isExpanded"
        @click.stop="toggleExpanded"
      >
        <ToolChevron :expanded="isExpanded" />
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
      :aria-label="regionLabel"
      data-testid="bash-tool-output-sr"
    >
      <pre class="bash-tool-code">{{ accessibleOutput }}</pre>
    </div>

    <div
      v-show="isExpanded"
      :id="detailsId"
      class="bash-tool-details"
      role="region"
      :aria-label="regionLabel"
      data-testid="bash-tool-details"
    >
      <RunningToolTime v-if="isRunning && isExpanded" :start-time="toolInvokedAt" />
      <div v-if="displayData?.workingDir" class="bash-tool-section">
        <div class="bash-tool-label" :id="cwdLabelId">Working Directory:</div>
        <pre class="bash-tool-code bash-tool-code-cwd" :aria-labelledby="cwdLabelId">{{
          displayData.workingDir
        }}</pre>
      </div>
      <div class="bash-tool-section">
        <div class="bash-tool-label" :id="commandLabelId">Command:</div>
        <HighlightedCode
          tag="pre"
          class="bash-tool-code"
          :source="command"
          language="shellscript"
          :aria-labelledby="commandLabelId"
        />
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
          {{ outputLabel }}:
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
import HighlightedCode from "../HighlightedCode.vue";
import AnsiText from "./AnsiText.vue";
import { useToolExpanded } from "../../composables/toolDetail";
import { useScreenReaderMode } from "../../composables/screenReaderMode";
import { announceToolA11y } from "../../../services/a11yAnnouncer";
import {
  bashCompletionAnnouncement,
  completionKind,
  terminalOutputLabel,
  terminalToggleLabel,
} from "./bashToolA11y";
import ToolChevron from "./ToolChevron.vue";
import RunningToolTime from "./RunningToolTime.vue";
import ToolStatusIcon from "./ToolStatusIcon.vue";
import { isCancelledToolResult, toolOutcomeSuffix } from "../../utils/toolStatus";

interface BashDisplayData {
  workingDir: string;
  exitCode?: number;
}

const props = defineProps<{
  toolInput?: unknown;
  isRunning?: boolean;
  toolInvokedAt?: string | null;
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

// Details panel — collapsed by default (expanded in screen-reader mode).
const isExpanded = useToolExpanded();
// Streaming preview — expanded to show full streaming output.
const previewExpanded = ref(false);
const previewRef = ref<InstanceType<typeof AnsiText> | null>(null);
const expandedStreamRef = ref<InstanceType<typeof AnsiText> | null>(null);

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
}

// Collapse details when the tool completes (stay expanded in screen-reader mode).
watch(
  () => props.isRunning,
  (running, prevRunning) => {
    if (prevRunning && !running) {
      isExpanded.value = screenReaderMode.value;
      previewExpanded.value = false;
    }
  },
);

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

const isCancelled = computed(() => props.hasError && isCancelledToolResult(output.value));

const outputLabel = computed(() => {
  if (isCancelled.value) return "Output (cancelled)";
  const exitCode = displayData.value?.exitCode;
  if (typeof exitCode === "number") return `Output (exit code ${exitCode})`;
  return props.hasError ? "Output (Error)" : "Output";
});

const displayCommand = computed(() => {
  const cmd = command.value;
  const maxLen = 300;
  return cmd.length <= maxLen ? cmd : cmd.substring(0, maxLen) + "...";
});

const isComplete = computed(() => !props.isRunning && props.toolResult !== undefined);

const regionLabel = computed(() => terminalOutputLabel(command.value));
const toggleLabel = computed(() => {
  const label = terminalToggleLabel(isExpanded.value, command.value);
  if (isComplete.value && isCancelled.value) return `${label}, cancelled`;
  const exitCode = displayData.value?.exitCode;
  const exit = props.hasError && typeof exitCode === "number" ? `, exit code ${exitCode}` : "";
  return `${label}${toolOutcomeSuffix(isComplete.value, props.hasError)}${exit}`;
});

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
