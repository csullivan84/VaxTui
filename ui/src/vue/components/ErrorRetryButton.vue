<!-- Sub-component of Message.vue (ported from the ErrorRetryButton in
     components/Message.tsx). Retries a failed conversation; preserves the
     .error-retry-row / .error-retry-button / .error-retry-error classes and the
     data-testid "error-retry-button". -->
<template>
  <div class="error-retry-row">
    <button
      ref="buttonRef"
      type="button"
      class="error-retry-button"
      :disabled="pending"
      data-testid="error-retry-button"
      @click="onClick"
    >
      {{ pending ? "Retrying\u2026" : "Retry" }}
    </button>
    <span v-if="error" class="error-retry-error" role="alert">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from "vue";
import { api } from "../../services/api";
import { announceA11y } from "../../services/a11yAnnouncer";

const props = defineProps<{ conversationId: string }>();

const pending = ref(false);
const error = ref<string | null>(null);
const buttonRef = ref<HTMLButtonElement | null>(null);

async function onClick(e: MouseEvent) {
  e.stopPropagation();
  if (pending.value) return;
  pending.value = true;
  error.value = null;
  try {
    await api.retryConversation(props.conversationId);
    announceA11y("Retry started.");
    // On success the server starts a new turn, appending messages so this error
    // is no longer the last message and this button stops rendering. Clear
    // pending after a fallback delay so the button recovers even if no new
    // message arrives (e.g. transient SSE disconnect).
    window.setTimeout(() => (pending.value = false), 10000);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    pending.value = false;
    announceA11y(`Retry failed: ${error.value}`, "assertive");
    await nextTick();
    buttonRef.value?.focus();
  }
}
</script>
