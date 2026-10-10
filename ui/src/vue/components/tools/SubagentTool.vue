<!-- Vue port of components/SubagentTool.tsx.
     Preserves: .tool, .tool-header, .tool-summary, .tool-emoji ⚡,
     .tool-badge, .subagent-model-badge, .tool-error,
     .tool-success, .tool-command, .tool-toggle, .tool-details, .tool-section,
     .tool-label, .tool-code, .tool-time, .subagent-link,
     data-testid tool-call-running/completed.

     Header: the subagent's slug, its model as a muted tag, and the first line
     of the prompt, laid out like the bash card's command line.

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
        <span class="tool-command subagent-tool-slug">{{ slug }}</span>
        <span v-if="model" class="tool-tag">{{ model }}</span>
        <ToolStatusIcon v-if="isComplete && hasError" state="error" class="tool-error" />
        <ToolStatusIcon v-if="isComplete && !hasError" state="ok" class="tool-success" />
        <span class="tool-command" :title="prompt">{{ firstLine }}</span>
      </div>
      <button
        type="button"
        class="tool-toggle"
        tabindex="-1"
        :aria-label="toggleLabel"
        :aria-expanded="isExpanded"
        @click.stop="toggleExpanded"
      >
        <ToolChevron :expanded="isExpanded" />
      </button>
    </div>

    <SubagentLiveStrip v-if="showLive" :slug="liveSlug" :activity="activity" />

    <ToolAccessibleBody
      :expanded="isExpanded"
      :label="outputLabel"
      :plain-text="accessibleText"
      body-class="tool-details"
      :body-id="detailsId"
    >
      <RunningToolTime v-if="isRunning && isExpanded" :start-time="toolInvokedAt" />
      <div class="tool-section">
        <div class="tool-label">
          Prompt to '{{ slug }}':
          <span v-if="model" class="tool-badge subagent-model-badge">{{ model }}</span>
        </div>
        <div class="tool-code">{{ prompt || "(no prompt)" }}</div>
      </div>

      <div v-if="isComplete" class="tool-section">
        <div class="tool-label">
          Response{{ hasError ? " (Error)" : "" }}:
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
import SubagentLiveStrip from "../SubagentLiveStrip.vue";
import ToolChevron from "./ToolChevron.vue";
import RunningToolTime from "./RunningToolTime.vue";
import ToolStatusIcon from "./ToolStatusIcon.vue";
import { toolOutcomeSuffix } from "../../utils/toolStatus";

interface SubagentInput {
  slug?: string;
  prompt?: string;
  model?: string;
}

const props = defineProps<{
  toolInput?: unknown;
  isRunning?: boolean;
  toolInvokedAt?: string | null;
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

// Live subagent state (working flag + current activity), joined from the
// conversation list + messageStore via the injected app context.
const { conv, working, activity } = useSubagentLive(
  slug,
  computed(() => props.displayData?.conversation_id),
);
// The subagent keeps working after this tool call completes (the call only
// acknowledges dispatch), so the strip keys off the conversation's working flag, not the tool-call state.
const showLive = computed(() => working.value || (!!props.isRunning && !!conv.value));
const liveSlug = computed(() => conv.value?.slug || slug.value);

// Extract result text
const resultText = computed(
  () =>
    props.toolResult
      ?.filter((r) => r.Type === 2) // ContentTypeText
      .map((r) => r.Text)
      .join("\n") || "",
);

const firstLine = computed(() => prompt.value.trim().split(/\r?\n/)[0]);
const isComplete = computed(() => !props.isRunning && props.toolResult !== undefined);

const outputLabel = computed(() => `Subagent details for ${slug.value}`);
const toggleLabel = computed(
  () =>
    (isExpanded.value
      ? `Collapse subagent details for ${slug.value}`
      : `Expand subagent details for ${slug.value}`) +
    toolOutcomeSuffix(isComplete.value, props.hasError),
);
const accessibleText = computed(() => {
  const parts = [`Prompt to ${slug.value}:\n${prompt.value || "(no prompt)"}`];
  if (model.value) parts.push(`Model: ${model.value}`);
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

<style scoped>
.subagent-tool-slug {
  flex-shrink: 0;
  max-width: 40%;
}
</style>
