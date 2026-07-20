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
withDefaults(
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
</script>
