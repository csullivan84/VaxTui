<!-- Vue port of components/SubagentTool.tsx.
     Preserves: .tool, .tool-header, .tool-summary, .tool-emoji ⚡, .tool-name,
     .tool-badge, .subagent-model-badge, .tool-error,
     .tool-success, .tool-command, .tool-toggle, .tool-details, .tool-section,
     .tool-label, .tool-code, .tool-time, .subagent-link,
     data-testid tool-call-running/completed.

     Live view: while the subagent is working (per the conversation list's
     authoritative working flag, injected from App via subagentLive), a strip
     under the header shows what it's doing right now — streaming text tail,
     running tool headline, or last-message preview — sourced from the same
     /api/stream2 events the rest of the UI already receives. Clicking the
     strip opens the subagent conversation.

     Subagent navigation: the React original navigates client-side by pushing
     `/c/{slug}` onto window.history and dispatching a popstate event (no parent
     callback prop). This port replicates that behavior via
     navigateToConversationSlug; it does not introduce a new prop or emit. -->
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

    <button
      v-if="showLive"
      type="button"
      class="subagent-live"
      data-testid="subagent-live"
      :title="`Open subagent '${liveSlug}'`"
      :aria-label="`Open subagent ${liveSlug}: ${activity || 'working'}`"
      @click.stop="openSubagent"
    >
      <span class="working-indicator" aria-hidden="true" />
      <span class="subagent-live-slug">{{ liveSlug }}&nbsp;↗</span>
      <span class="subagent-live-activity">{{ activity || "working\u2026" }}</span>
    </button>

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
          <a :href="`/c/${liveSlug}`" class="subagent-link" @click="onLinkClick">
            View subagent conversation →
          </a>
        </div>
      </div>
    </ToolAccessibleBody>

    <a
      v-if="!isExpanded && displayData?.conversation_id"
      :href="`/c/${liveSlug}`"
      class="sr-only"
      @click="onLinkClick"
    >
      View subagent {{ liveSlug }} conversation
    </a>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import type { LLMContent } from "../../../types";
import { useToolExpanded } from "../../composables/toolDetail";
import ToolAccessibleBody from "./ToolAccessibleBody.vue";
import { announceA11y } from "../../../services/a11yAnnouncer";
import { useSubagentLive, navigateToConversationSlug } from "../../composables/subagentLive";

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

// Prefer the display data's slug: the server may have suffixed the requested
// slug for uniqueness, and displayData carries the actual one.
const slug = computed(() => props.displayData?.slug || input.value.slug || "subagent");
const prompt = computed(() => input.value.prompt || "");
const model = computed(() => input.value.model || "");
const wait = computed(() => input.value.wait !== false);
const timeout = computed(() => input.value.timeout_seconds || 60);

// Live subagent state (working flag + current activity), joined from the
// conversation list + messageStore via the injected app context.
const { conv, working, activity } = useSubagentLive(
  slug,
  computed(() => props.displayData?.conversation_id),
);
// The subagent can still be working after this tool call completed
// (wait=false, or a wait timeout returned a progress summary), so the strip
// keys off the conversation's working flag, not the tool-call state.
const showLive = computed(() => working.value || (!!props.isRunning && !!conv.value));
const liveSlug = computed(() => conv.value?.slug || slug.value);

function openSubagent() {
  announceA11y(`Opened subagent ${liveSlug.value}.`);
  navigateToConversationSlug(liveSlug.value);
}

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
    parts.push(
      `Response${props.hasError ? " (Error)" : ""}:\n${resultText.value || "(no response)"}`,
    );
  }
  return parts.join("\n\n");
});

function onLinkClick(e: MouseEvent) {
  // Let the browser handle cmd/ctrl/shift/middle-click (open in new tab/window).
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  announceA11y(`Opened subagent ${liveSlug.value}.`);
  navigateToConversationSlug(liveSlug.value);
}
</script>
