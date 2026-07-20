<!-- Visually hidden live region for VoiceOver / screen readers.
     Announces agent working/idle and stream connection faults without
     redesigning the visual status bar. -->
<template>
  <div
    class="sr-only"
    :aria-live="politeness"
    aria-atomic="true"
    data-testid="status-announcer"
  >
    {{ announcement }}
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import {
  agentAnnouncement,
  errorAnnouncement,
  streamAnnouncement,
  type Announcement,
  type Politeness,
  type StreamStatus,
} from "./statusAnnouncer";

const props = withDefaults(
  defineProps<{
    agentWorking: boolean;
    streamStatus?: StreamStatus;
    error?: string | null;
    /** Tool cards that finished during the turn that just ended. */
    toolsCompleted?: number;
  }>(),
  {
    streamStatus: "connected",
    error: null,
    toolsCompleted: 0,
  },
);

const announcement = ref("");
const politeness = ref<Politeness>("polite");
let announcementVersion = 0;

function apply(next: Announcement | null) {
  if (!next) return;

  const version = ++announcementVersion;
  // Clear then set so repeated identical phrases still fire (VO quirk).
  announcement.value = "";
  politeness.value = next.politeness;
  if (!next.text) return;

  // Microtask is enough; no sleep/timers in the product path.
  queueMicrotask(() => {
    if (version === announcementVersion) announcement.value = next.text;
  });
}

watch(
  () => props.agentWorking,
  (working, wasWorking) => {
    apply(agentAnnouncement(working, wasWorking, props.toolsCompleted));
  },
);

watch(
  () => props.streamStatus,
  (status, prev) => {
    apply(streamAnnouncement(status, prev));
  },
);

watch(
  () => props.error,
  (err, prev) => {
    apply(errorAnnouncement(err, prev));
  },
);
</script>
