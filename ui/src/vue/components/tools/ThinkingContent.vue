<!-- Vue port of components/ThinkingContent.tsx. Collapsible chain-of-thought,
     default collapsed. Preserves: .thinking-content, .thinking-content-wrapper,
     data-testid thinking-content, .thinking-clickable-area, .thinking-emoji 💭,
     .thinking-text, .thinking-toggle, .thinking-toggle-button.

     shelley-a11y: full thinking text stays in the a11y tree when collapsed. -->
<template>
  <div class="thinking-content thinking-content-wrapper" data-testid="thinking-content">
    <div
      class="thinking-clickable-area"
      role="button"
      tabindex="0"
      :aria-expanded="isExpanded"
      :aria-label="toggleLabel"
      @click="isExpanded = !isExpanded"
      @keydown.enter.prevent="isExpanded = !isExpanded"
      @keydown.space.prevent="isExpanded = !isExpanded"
    >
      <span class="thinking-emoji" aria-hidden="true">💭</span>
      <div class="thinking-text" :class="{ 'thinking-text-collapsed': !isExpanded }" aria-hidden="true">
        {{ isExpanded ? thinking : preview }}
      </div>
      <button
        type="button"
        class="thinking-toggle thinking-toggle-button"
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

    <!-- Collapsed: full CoT still navigable; expanded visual already shows full text. -->
    <div
      v-if="!isExpanded && thinking"
      class="sr-only"
      role="region"
      aria-label="Reasoning"
      data-testid="thinking-content-sr"
    >
      <pre>{{ thinking }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{ thinking: string }>();

const isExpanded = ref(false);

// Collapsed preview: first line only, capped to keep the DOM light.
// Visual truncation (ellipsis at the edge of the line) is done in CSS
// via .thinking-text-collapsed. Full text remains in the a11y tree below.
const preview = computed(() => {
  if (!props.thinking) return "";
  const firstLine = props.thinking.split("\n", 1)[0];
  return firstLine.length > 500 ? firstLine.substring(0, 500) : firstLine;
});
const toggleLabel = computed(() =>
  isExpanded.value ? "Collapse reasoning" : "Expand reasoning",
);
</script>
