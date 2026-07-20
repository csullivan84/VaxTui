<!-- Vue port of components/MarkdownContent.tsx. Renders sanitized markdown HTML
     via v-html. The pure pipeline lives in utils/markdownRender.ts and is
     shared with the React component. Preserves the .markdown-content
     .break-words container contract. -->
<template>
  <div ref="rootRef" class="markdown-content break-words" @keydown="onKeydown" v-html="html"></div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { renderMarkdownToSafeHTML } from "../../utils/markdownRender";
import { announceA11y } from "../../services/a11yAnnouncer";

const props = defineProps<{
  text: string;
  // When set, local-path markdown images (relative or absolute file paths) are
  // rewritten to the per-message file endpoint and rendered. Without it we
  // cannot authorize a local file, so such images are dropped.
  messageId?: string;
}>();

const html = computed(() => renderMarkdownToSafeHTML(props.text, props.messageId));
const rootRef = ref<HTMLDivElement | null>(null);

function codeBlocks(): HTMLElement[] {
  return Array.from(rootRef.value?.querySelectorAll<HTMLElement>("pre > code") ?? []);
}

function prepareCodeBlocks() {
  const blocks = codeBlocks();
  blocks.forEach((block, index) => {
    const language = Array.from(block.classList)
      .find((name) => name.startsWith("language-"))
      ?.slice("language-".length);
    const lineCount = block.textContent?.split("\n").length ?? 0;
    block.tabIndex = 0;
    block.setAttribute(
      "aria-label",
      `${language ? `${language} ` : ""}code block ${index + 1} of ${blocks.length}, ${lineCount} ${lineCount === 1 ? "line" : "lines"}`,
    );
    block.setAttribute(
      "aria-keyshortcuts",
      "Alt+ArrowDown Alt+ArrowUp Control+Shift+C Meta+Shift+C",
    );
  });
}

function focusCodeBlock(direction: 1 | -1) {
  const blocks = codeBlocks();
  if (blocks.length === 0) return;
  const current =
    document.activeElement instanceof HTMLElement ? blocks.indexOf(document.activeElement) : -1;
  const next =
    current === -1
      ? direction === 1
        ? 0
        : blocks.length - 1
      : (current + direction + blocks.length) % blocks.length;
  blocks[next].focus();
  announceA11y(`Code block ${next + 1} of ${blocks.length}.`);
}

function onKeydown(event: KeyboardEvent) {
  if (event.altKey && event.key === "ArrowDown") {
    event.preventDefault();
    focusCodeBlock(1);
    return;
  }
  if (event.altKey && event.key === "ArrowUp") {
    event.preventDefault();
    focusCodeBlock(-1);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "c") {
    const target =
      event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("pre > code") : null;
    if (!target) return;
    event.preventDefault();
    navigator.clipboard.writeText(target.textContent ?? "").then(
      () => announceA11y("Code block copied."),
      () => announceA11y("Could not copy code block.", "assertive"),
    );
  }
}

onMounted(prepareCodeBlocks);
watch(html, () => nextTick(prepareCodeBlocks));
</script>
