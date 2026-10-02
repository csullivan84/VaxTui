<!-- Vue port of components/EditableFileModal.tsx. Monaco-based file editor
     modal teleported to <body>. Preserves the diff-viewer-overlay/container/
     header/content/editor/close class contract, role="presentation"/"dialog",
     aria-modal, the aria-label "Edit file" (or the given title), and the
     agents-md-* header/save-status classes. Loads Monaco via services/monaco,
     auto-saves (debounced) to /api/write-file. When `commentable`, offers the same
     edit/comment mode toggle as DiffViewer: comment mode makes the editor
     read-only and click-to-comment, emitting "comment" with the quoted
     comment block. Markdown files also offer a safe rendered preview.
     Emits "close" (React onClose) and
     "saved" (React onSaved, with the saved content). -->
<template>
  <Teleport v-if="isOpen" to="body">
    <div class="diff-viewer-overlay" role="presentation">
      <div
        ref="modalRef"
        class="diff-viewer-container"
        role="dialog"
        aria-modal="true"
        :aria-label="title || 'Edit file'"
      >
        <div class="diff-viewer-header">
          <div class="diff-viewer-header-row">
            <span class="agents-md-header-title">{{ title || "Edit file" }}</span>
            <code class="agents-md-header-path">{{ resolvedPath }}</code>
            <span
              v-if="saveStatus !== 'idle'"
              :class="`agents-md-save-status agents-md-save-${saveStatus}`"
            >
              <template v-if="saveStatus === 'saving'">Saving...</template>
              <template v-else-if="saveStatus === 'saved'">Saved</template>
              <template v-else-if="saveStatus === 'error'">Error saving</template>
            </span>
            <div
              v-if="commentable || isMarkdownFile"
              class="diff-viewer-mode-toggle"
              role="group"
              aria-label="File view"
            >
              <button
                v-if="commentable"
                v-tooltip.top="'Comment mode'"
                :class="`diff-viewer-mode-btn ${mode === 'comment' ? 'active' : ''}`"
                aria-label="Comment mode"
                :aria-pressed="mode === 'comment'"
                @click="setMode('comment')"
              >
                💬
              </button>
              <button
                v-tooltip.top="'Edit mode'"
                :class="`diff-viewer-mode-btn ${mode === 'edit' ? 'active' : ''}`"
                aria-label="Edit mode"
                :aria-pressed="mode === 'edit'"
                @click="setMode('edit')"
              >
                ✏️
              </button>
              <button
                v-if="isMarkdownFile"
                v-tooltip.top="isMac ? 'Preview mode (⌘⌥P)' : 'Preview mode (Ctrl+Alt+P)'"
                :class="`diff-viewer-mode-btn ${mode === 'preview' ? 'active' : ''}`"
                aria-label="Preview mode"
                :aria-keyshortcuts="isMac ? 'Meta+Alt+P' : 'Control+Alt+P'"
                :aria-pressed="mode === 'preview'"
                :disabled="loadStatus !== 'loaded' || !!showCommentDialog"
                @click="setMode('preview')"
              >
                👁️
              </button>
              <button
                v-if="isMarkdownFile && isDesktop"
                v-tooltip.top="'Split view'"
                :class="`diff-viewer-mode-btn ${mode === 'split' ? 'active' : ''}`"
                aria-label="Split view"
                :aria-pressed="mode === 'split'"
                :disabled="loadStatus !== 'loaded' || !!showCommentDialog"
                @click="setMode('split')"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  aria-hidden="true"
                >
                  <rect x="1.5" y="2" width="13" height="12" rx="1.5" />
                  <path d="M8 2v12" />
                </svg>
              </button>
            </div>
            <button
              v-tooltip.top="'Close (Esc)'"
              class="diff-viewer-close"
              aria-label="Close (Esc)"
              @click="emit('close')"
            >
              ×
            </button>
          </div>
        </div>
        <div
          ref="contentRef"
          class="diff-viewer-content"
          :class="{ 'file-editor-split': mode === 'split' }"
        >
          <div v-if="loadStatus === 'error'" class="diff-viewer-loading">
            <span>Failed to load {{ resolvedPath }}. Editing is disabled.</span>
          </div>
          <template v-else>
            <div
              v-if="loadStatus !== 'loaded' || (!monacoLoaded && mode !== 'preview')"
              class="diff-viewer-loading"
            >
              <div class="spinner"></div>
              <span>Loading editor...</span>
            </div>
            <div
              ref="containerRef"
              class="diff-viewer-editor"
              :style="{
                display:
                  monacoLoaded && content !== null && loadStatus === 'loaded' && mode !== 'preview'
                    ? 'block'
                    : 'none',
              }"
            />
            <div
              v-if="
                (mode === 'preview' || mode === 'split') &&
                isMarkdownFile &&
                loadStatus === 'loaded'
              "
              ref="previewRef"
              class="diff-viewer-preview"
              role="region"
              aria-label="Markdown preview"
              tabindex="0"
            >
              <div class="file-preview-document">
                <MarkdownContent
                  v-if="previewText"
                  :text="previewText"
                  :defer-code-highlighting="mode === 'split'"
                  file-preview
                />
                <p v-else class="file-preview-empty">
                  {{
                    mode === "split"
                      ? "Start typing to see a preview."
                      : "Nothing here yet. Switch to Edit to write."
                  }}
                </p>
              </div>
            </div>
          </template>
          <!-- Floating "add comment" prompt shown next to a selection in comment mode -->
          <button
            v-if="commentPrompt"
            v-tooltip.top="'Add comment on selection'"
            class="diff-viewer-comment-prompt"
            :style="{ top: `${commentPrompt.top}px`, left: `${commentPrompt.left}px` }"
            @mousedown.prevent
            @click="openCommentFromPrompt"
          >
            💬 Comment
          </button>
        </div>

        <!-- Comment dialog -->
        <CommentDialog
          v-if="showCommentDialog"
          :key="commentDialogOpens"
          v-model:text="commentText"
          :where="lineCommentLabel(showCommentDialog, false)"
          :quoted="showCommentDialog.selectedText"
          @submit="handleAddComment"
          @cancel="showCommentDialog = null"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import type * as Monaco from "monaco-editor";
import { loadMonaco } from "../../services/monaco";
import {
  unsavedFileContent,
  waitForPendingFileWrites,
  writeFileInOrder,
} from "../../services/orderedFileWrites";
import { isDarkModeActive } from "../../services/theme";
import { tildifyPath } from "../../utils/tildify";
import { isMac } from "../../utils/menuShortcuts";
import { lineCommentLabel, useMonacoComments } from "../composables/monacoComments";
import CommentDialog from "./CommentDialog.vue";
import MarkdownContent from "./MarkdownContent.vue";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type LoadStatus = "loading" | "loaded" | "error";

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    path: string;
    title?: string;
    /** Explicit Monaco language id. When omitted, the language is detected
     *  from the file extension (falling back to markdown). */
    language?: string;
    loadUrl?: string;
    /** Offer the edit/comment mode toggle (like DiffViewer). Comment mode
     *  makes the editor read-only; submitted comments are emitted as
     *  "comment" with a quoted block for the message input. */
    commentable?: boolean;
  }>(),
  {},
);
const emit = defineEmits<{
  (e: "close"): void;
  (e: "saved", content: string): void;
  (e: "comment", text: string): void;
}>();

const content = ref<string | null>(null);
const loadStatus = ref<LoadStatus>("loading");
const monacoLoaded = ref(false);
const saveStatus = ref<SaveStatus>("idle");
const previewText = ref("");
// Interaction mode. Commentable modals open in edit mode (matching the plain
// editor behavior); the toggle switches to read-only click-to-comment.
const mode = ref<"comment" | "edit" | "preview" | "split">("edit");
// The path actually saved to and displayed. Equals props.path except when a
// loadUrl response reports its own path: /api/user-agents-md resolves the
// AGENTS.md Shelley is actually using, which may differ from the page-load
// snapshot in init data (e.g. created at a non-default location after load).
const resolvedPath = ref(props.path);
const isMarkdownFile = computed(() => /\.md$/i.test(resolvedPath.value));

// Monaco editor instances must NOT be deeply reactive: a plain ref() proxies
// the editor's huge internal object graph and pegs the main thread. shallowRef
// tracks the reference swap (create/dispose) without proxying internals.
const editor = shallowRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
let monacoMod: typeof Monaco | null = null;
const containerRef = ref<HTMLDivElement | null>(null);
const contentRef = ref<HTMLDivElement | null>(null);
const modalRef = ref<HTMLDivElement | null>(null);
const previewRef = ref<HTMLDivElement | null>(null);
let saveTimeout: number | null = null;
let statusTimeout: number | null = null;
let previewUpdateTimeout: number | null = null;
let unmounted = false;
let saveVersion = 0;
const isDesktop = ref(window.innerWidth >= 768);
let modeBeforePreview: "comment" | "edit" | "split" = "edit";

function setMode(next: "comment" | "edit" | "preview" | "split") {
  if (next === "preview" || next === "split") {
    if (
      !isMarkdownFile.value ||
      loadStatus.value !== "loaded" ||
      showCommentDialog.value ||
      (next === "split" && !isDesktop.value)
    )
      return;
    // Read Monaco, not the initial response: the latest changes may still be
    // waiting for the debounced auto-save.
    if (mode.value !== "preview") modeBeforePreview = mode.value;
    previewText.value = editor.value?.getValue() ?? content.value ?? "";
  }
  if (previewUpdateTimeout) {
    clearTimeout(previewUpdateTimeout);
    previewUpdateTimeout = null;
  }
  mode.value = next;
  void nextTick(() => {
    if (mode.value !== next) return;
    if (next === "preview") {
      previewRef.value?.focus();
    } else {
      // Monaco has been display:none during preview; relayout before focusing.
      editor.value?.layout();
      if (isDesktop.value) editor.value?.focus();
    }
  });
}

// Shared comment-mode UX (click-to-comment, selection prompt, dialog state).
const {
  showCommentDialog,
  commentDialogOpens,
  commentPrompt,
  commentText,
  attach: attachComments,
  handleAddComment,
  openCommentFromPrompt,
  clearPrompt,
  reset: resetComments,
} = useMonacoComments({
  monaco: () => monacoMod,
  mode: () => mode.value,
  isMobile: () => !isDesktop.value,
  promptHost: () => contentRef.value,
  fileRef: () => tildifyPath(resolvedPath.value),
  onSubmit: (block) => emit("comment", block),
});
let commentsCleanup: (() => void) | null = null;

// Apply mode changes to the live editor: comment mode is read-only and must
// not drag-and-drop selections; leaving comment mode clears the prompt and,
// with pending text, the dialog stays (matching DiffViewer's behavior of
// clearing only the selection prompt).
watch(mode, (m) => {
  clearPrompt();
  editor.value?.updateOptions({ readOnly: m === "comment" || m === "preview" });
});

// A host can reuse this instance for a different path without closing it.
// Never leave the preview selected after switching to a non-Markdown file.
watch(isMarkdownFile, (markdown) => {
  if (!markdown && (mode.value === "preview" || mode.value === "split")) {
    setMode("edit");
    previewText.value = "";
  }
});

function onResize() {
  isDesktop.value = window.innerWidth >= 768;
}

// Re-apply viewport-dependent Monaco options when crossing the breakpoint.
watch(isDesktop, (desktop) => {
  editor.value?.updateOptions(mobileLayoutOptions(!desktop));
  if (!desktop && mode.value === "split") setMode("edit");
  if (!desktop && modeBeforePreview === "split") modeBeforePreview = "edit";
});

// --- File load (when opened / path / loadUrl change) ---
let currentLoadCancel: (() => void) | null = null;
watch(
  () => [props.isOpen, props.path, props.loadUrl] as const,
  (_current, previous) => {
    if (!props.isOpen) return;
    // Hosts may reuse this modal for another path. Flush the old buffer to its
    // original resolved path before replacing Monaco; retaining that editor
    // would display and save the previous file under the next path.
    const changedFile = !!previous && (previous[1] !== props.path || previous[2] !== props.loadUrl);
    if (changedFile && editor.value) {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
        void saveContent(editor.value.getValue());
      }
      disposeEditor();
      content.value = null;
    }
    let cancelled = false;
    loadStatus.value = "loading";
    // Assume the prop path until (or unless) the load response reports the
    // real one; see resolvedPath.
    resolvedPath.value = props.path;
    (async () => {
      try {
        // A keyed editor can reopen this path while its predecessor is still
        // saving. Only AGENTS.md resolves its path on the server; ordinary
        // /api/read-file loads must not wait for unrelated files' saves.
        await waitForPendingFileWrites(
          props.loadUrl === "/api/user-agents-md" ? undefined : props.path,
        );
        if (cancelled) return;
        const response = await fetch(
          props.loadUrl || `/api/read?path=${encodeURIComponent(props.path)}`,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let json: { path?: string; content: string } | null = null;
        let text: string;
        if (props.loadUrl) {
          json = (await response.json()) as { path?: string; content: string };
          text = json.content;
        } else {
          text = await response.text();
        }
        if (cancelled) return;
        if (json?.path) resolvedPath.value = json.path;
        const unsaved = unsavedFileContent(resolvedPath.value);
        content.value = unsaved ?? text ?? "";
        if (unsaved !== undefined) saveStatus.value = "error";
        loadStatus.value = "loaded";
      } catch (err) {
        console.error("Failed to load editable file:", err);
        if (!cancelled) loadStatus.value = "error";
      }
    })();
    // store cancel on a ref-keyed closure via the watcher's cleanup
    currentLoadCancel = () => {
      cancelled = true;
    };
  },
  { immediate: true },
);

// --- Load Monaco when opened ---
watch(
  () => [props.isOpen, monacoLoaded.value] as const,
  () => {
    if (props.isOpen && !monacoLoaded.value) {
      loadMonaco()
        .then((monaco) => {
          monacoMod = monaco;
          monacoLoaded.value = true;
        })
        .catch((err) => console.error("Failed to load Monaco:", err));
    }
  },
  { immediate: true },
);

async function saveContent(text: string) {
  const path = resolvedPath.value;
  if (!path) return;
  const version = ++saveVersion;
  if (statusTimeout) clearTimeout(statusTimeout);
  saveStatus.value = "saving";
  try {
    const response = await writeFileInOrder(path, text);
    if (response.ok && !unmounted) emit("saved", text);
    if (unmounted || !props.isOpen || version !== saveVersion) return;
    saveStatus.value = response.ok ? "saved" : "error";
    statusTimeout = window.setTimeout(() => (saveStatus.value = "idle"), response.ok ? 2000 : 3000);
  } catch (err) {
    console.error("Failed to save:", err);
    if (unmounted || !props.isOpen || version !== saveVersion) return;
    saveStatus.value = "error";
    statusTimeout = window.setTimeout(() => (saveStatus.value = "idle"), 3000);
  }
}

function scheduleSave(text: string) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(() => {
    saveContent(text);
    saveTimeout = null;
  }, 1000);
}

// Resolve the Monaco language id: an explicit prop wins; otherwise detect
// from the file extension via Monaco's registered languages (matching
// DiffViewer), defaulting to markdown when unknown.
function resolveLanguage(monaco: typeof Monaco, path: string): string {
  if (props.language) return props.language;
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "markdown";
  const ext = path.slice(dot).toLowerCase();
  for (const lang of monaco.languages.getLanguages()) {
    if (lang.extensions?.includes(ext)) return lang.id;
  }
  return "markdown";
}

// Viewport-dependent layout options (mirrors DiffViewer's mobile handling).
// On mobile we drop line numbers / folding / glyph margin so Monaco's own
// layout leaves only a slim gutter. This must be real Monaco options — the
// mobile CSS that squeezes `.margin` to 8px doesn't change Monaco's internal
// layout math, so with a wide margin the text column (and its scrollbar)
// would end ~54px short of the right edge.
function mobileLayoutOptions(mobile: boolean): Monaco.editor.IEditorOptions {
  return {
    lineNumbers: mobile ? "off" : "on",
    lineNumbersMinChars: mobile ? 0 : 3,
    lineDecorationsWidth: mobile ? 8 : 10,
    glyphMargin: !mobile,
    folding: !mobile,
    scrollbar: {
      verticalScrollbarSize: mobile ? 8 : 14,
      horizontalScrollbarSize: mobile ? 8 : 12,
    },
    overviewRulerLanes: mobile ? 1 : 3,
  };
}

// --- Create the editor once content + monaco are ready ---
watch(
  () => [monacoLoaded.value, content.value, props.language] as const,
  () => {
    if (!monacoLoaded.value || content.value === null || !containerRef.value || !monacoMod) return;
    if (editor.value) return;

    const monaco = monacoMod;
    const nextEditor = monaco.editor.create(containerRef.value, {
      value: content.value,
      language: resolveLanguage(monaco, resolvedPath.value),
      theme: isDarkModeActive() ? "vs-dark" : "vs",
      minimap: { enabled: false },
      wordWrap: "on",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      fontSize: 14,
      padding: { top: 8 },
      readOnly: mode.value === "comment" || mode.value === "preview",
      ...mobileLayoutOptions(!isDesktop.value),
    });
    editor.value = nextEditor;

    if (props.commentable) {
      commentsCleanup = attachComments(nextEditor, containerRef.value);
    }

    nextEditor.onDidChangeModelContent(() => {
      const text = nextEditor.getValue();
      scheduleSave(text);
      if (mode.value === "split") {
        if (previewUpdateTimeout) clearTimeout(previewUpdateTimeout);
        previewUpdateTimeout = window.setTimeout(() => {
          previewText.value = nextEditor.getValue();
          previewUpdateTimeout = null;
        }, 150);
      }
    });
    nextEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
      }
      saveContent(nextEditor.getValue());
    });
  },
  { immediate: true, flush: "post" },
);

function disposeEditor() {
  if (previewUpdateTimeout) {
    clearTimeout(previewUpdateTimeout);
    previewUpdateTimeout = null;
  }
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  commentsCleanup?.();
  commentsCleanup = null;
  if (editor.value) {
    editor.value.dispose();
    editor.value = null;
  }
}

// --- Theme observer ---
let themeObserver: MutationObserver | null = null;
watch(
  () => monacoLoaded.value,
  () => {
    if (!monacoMod) return;
    themeObserver?.disconnect();
    const updateTheme = () => monacoMod?.editor.setTheme(isDarkModeActive() ? "vs-dark" : "vs");
    themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) if (mutation.attributeName === "class") updateTheme();
    });
    themeObserver.observe(document.documentElement, { attributes: true });
  },
  { immediate: true },
);

// --- Escape handling (capture phase) ---
function handleKeyDown(e: KeyboardEvent) {
  // The file finder and other dialogs may be stacked above this editor.
  // Shortcuts (including Escape) belong to the dialog receiving the event.
  if (
    e.target instanceof Element &&
    e.target.closest('[role="dialog"], .command-palette-overlay') &&
    !modalRef.value?.contains(e.target)
  ) {
    return;
  }
  // Ctrl/Cmd+Alt+P works in either view without producing text on macOS or via AltGr.
  const previewShortcut =
    e.altKey &&
    !e.shiftKey &&
    !e.getModifierState("AltGraph") &&
    (isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) &&
    e.code === "KeyP";
  if (
    props.isOpen &&
    isMarkdownFile.value &&
    loadStatus.value === "loaded" &&
    !showCommentDialog.value &&
    previewShortcut
  ) {
    e.preventDefault();
    e.stopPropagation();
    setMode(mode.value === "preview" ? modeBeforePreview : "preview");
    return;
  }
  if (e.key !== "Escape") return;
  // A first Escape dismisses an open comment dialog rather than the modal.
  if (showCommentDialog.value) {
    showCommentDialog.value = null;
    return;
  }
  emit("close");
}

// --- React to open/close: attach/detach Escape + reset on close ---
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      window.addEventListener("keydown", handleKeyDown, true);
    } else {
      window.removeEventListener("keydown", handleKeyDown, true);
      // Flush a pending debounced save before tearing down.
      if (saveTimeout && editor.value) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
        saveContent(editor.value.getValue());
      }
      if (statusTimeout) {
        clearTimeout(statusTimeout);
        statusTimeout = null;
      }
      currentLoadCancel?.();
      disposeEditor();
      content.value = null;
      previewText.value = "";
      modeBeforePreview = "edit";
      resetComments();
      // Fresh open starts back in edit mode (the default), even if the
      // component instance is reused rather than remounted.
      mode.value = "edit";
    }
  },
);

onMounted(() => {
  window.addEventListener("resize", onResize);
  if (props.isOpen) window.addEventListener("keydown", handleKeyDown, true);
});
onUnmounted(() => {
  unmounted = true;
  window.removeEventListener("resize", onResize);
  window.removeEventListener("keydown", handleKeyDown, true);
  themeObserver?.disconnect();
  if (statusTimeout) clearTimeout(statusTimeout);
  // A host can open a different file without first closing this editor.
  // Flush the old buffer to its old path before the keyed instance is replaced.
  if (saveTimeout && editor.value) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
    void saveContent(editor.value.getValue());
  }
  disposeEditor();
});
</script>
