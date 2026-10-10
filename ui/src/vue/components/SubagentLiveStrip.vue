<!-- One-line live view of a working subagent: its slug and what it is doing
     right now. Opens the subagent conversation. Shown on the parent's subagent
     tool card and in the status bar's running-work popover. -->
<template>
  <button
    type="button"
    class="subagent-live"
    data-testid="subagent-live"
    :title="`Open subagent '${slug}'`"
    :aria-label="`Open subagent ${slug}: ${activity || 'working'}`"
    @click.stop="openSubagent"
  >
    <span class="working-indicator" aria-hidden="true" />
    <span class="subagent-live-slug">{{ slug }}&nbsp;↗</span>
    <span class="subagent-live-activity">{{ activity || "working\u2026" }}</span>
  </button>
</template>

<script setup lang="ts">
import { announceA11y } from "../../services/a11yAnnouncer";
import { navigateToConversationSlug } from "../composables/subagentLive";

const props = defineProps<{ slug: string; activity: string }>();
const emit = defineEmits<{ open: [] }>();

function openSubagent() {
  announceA11y(`Opened subagent ${props.slug}.`);
  navigateToConversationSlug(props.slug);
  emit("open");
}
</script>
