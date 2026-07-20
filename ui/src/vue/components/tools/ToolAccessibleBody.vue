<!-- Collapsible tool body that keeps plain-text output in the accessibility
     tree when visually collapsed. Sighted users expand to see the visual slot;
     screen readers always get a labeled <pre> region when collapsed. -->
<template>
  <!-- Collapsed: still navigable for assistive tech -->
  <div
    v-if="!expanded && plainText"
    class="sr-only"
    role="region"
    :aria-label="label"
    data-testid="tool-output-sr"
  >
    <pre class="tool-code">{{ plainText }}</pre>
  </div>

  <!-- Expanded: visual details (v-show keeps DOM stable for heavy tools) -->
  <div
    v-show="expanded"
    ref="bodyRef"
    :id="bodyId"
    :class="bodyClass"
    role="region"
    :aria-label="label"
    data-testid="tool-details-accessible"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    expanded: boolean;
    label: string;
    /** Full text kept available when collapsed (command output, JSON, raw diff, …). */
    plainText?: string;
    bodyClass?: string;
    bodyId?: string;
  }>(),
  {
    plainText: "",
    bodyClass: "tool-details",
    bodyId: undefined,
  },
);

const bodyRef = ref<HTMLElement | null>(null);

// Pointer activation of the nested chevron can move focus onto that
// presentation-only button. Once expansion settles, restore the single useful
// tab stop: the card header that owns aria-expanded.
watch(
  () => props.expanded,
  async (expanded) => {
    if (!expanded) return;
    const active = document.activeElement as HTMLElement | null;
    if (!active?.closest(".tool-header, .patch-tool-header, .bash-tool-header, .browser-tool-header, .screenshot-tool-header, .think-tool-header, .keyword-search-tool-header, .change-dir-tool-header")) {
      return;
    }
    await nextTick();
    const owner = bodyRef.value?.parentElement?.querySelector<HTMLElement>(
      '[role="button"][aria-expanded="true"]',
    );
    owner?.focus();
  },
);
</script>
