<!-- A message delivered from another conversation (a subagent's message_parent,
     or a parent's message to its subagent), rendered as a tool card: the
     sender's slug, a "message" tag, and the first line. A message that fits on
     one short line shows in full in the header; longer ones expand into the
     verbatim text, shown like other tool cards' details, with URLs linked. -->
<template>
  <div class="tool" data-testid="conversation-message-card">
    <div
      :class="['tool-header', { 'tool-header--static': !expandable }]"
      @click="expandable && (isExpanded = !isExpanded)"
    >
      <div class="tool-summary">
        <span class="tool-emoji" aria-hidden="true">⚡</span>
        <span class="tool-command conversation-message-card-slug" @click.stop>
          <ConversationSourceLink :source="source" />
        </span>
        <span class="tool-tag">message</span>
        <span
          :class="['tool-command', { 'conversation-message-card-full': !expandable }]"
          data-testid="conversation-message-card-headline"
          >{{ firstLine }}</span
        >
      </div>
      <button
        v-if="expandable"
        type="button"
        class="tool-toggle"
        :aria-label="isExpanded ? 'Collapse full message' : 'Expand full message'"
        :aria-expanded="isExpanded"
        :aria-controls="detailsId"
      >
        <ToolChevron :expanded="isExpanded" />
      </button>
    </div>
    <ToolAccessibleBody
      v-if="expandable"
      :expanded="isExpanded"
      label="Full message"
      :plain-text="text"
      body-class="tool-details"
      :body-id="detailsId"
    >
      <div class="tool-section">
        <div class="tool-label">Message:</div>
        <div class="tool-code">
          <template v-for="(part, i) in bodyParts" :key="i">
            <a
              v-if="part.type === 'link'"
              :href="part.href"
              target="_blank"
              rel="noopener noreferrer"
              class="text-link"
              >{{ part.content }}</a
            >
            <template v-else>{{ part.content }}</template>
          </template>
        </div>
      </div>
    </ToolAccessibleBody>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import { localhostLinkOptionsFromInit, parseLinks } from "../../utils/linkify";
import type { ConversationMessageSource } from "../../utils/messageSource";
import ConversationSourceLink from "./ConversationSourceLink.vue";
import { useToolExpanded } from "../composables/toolDetail";
import ToolAccessibleBody from "./tools/ToolAccessibleBody.vue";
import ToolChevron from "./tools/ToolChevron.vue";

const props = defineProps<{
  source: ConversationMessageSource;
  text: string;
}>();

/** Longest single-line message shown in full in the header. */
const HEADLINE_MAX = 80;

const isExpanded = useToolExpanded();
const detailsId = `conversation-message-${useId()}`;
const trimmed = computed(() => props.text.trim());
const firstLine = computed(() => trimmed.value.split(/\r?\n/)[0]);
const bodyParts = computed(() => parseLinks(props.text, localhostLinkOptionsFromInit()));
const expandable = computed(
  () => firstLine.value !== trimmed.value || trimmed.value.length > HEADLINE_MAX,
);
</script>

<style scoped>
.conversation-message-card-slug {
  flex-shrink: 0;
  max-width: 40%;
}
/* Styled like the subagent card's slug; the link shows only on hover. */
.conversation-message-card-slug a {
  color: inherit;
  text-decoration: none;
}
.conversation-message-card-slug a:hover {
  text-decoration: underline;
}
/* Nothing to expand: wrap rather than hide the end of the message. */
.conversation-message-card-full {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
