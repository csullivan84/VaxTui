<!--
  ChatOverflowMenu.vue — the top-right "kebab" overflow menu.

  This is the first piece of the UI rebuilt on real PrimeVue *components*
  (the rest of the Vue world so far only consumes the PrimeVue *theme*). It
  replaces a hand-rolled dropdown — a `v-if` panel with a manual document
  `mousedown` outside-click listener and bespoke segmented-toggle rows — with:

    - <Popover>     the dropdown surface (dismiss-on-outside-click + Esc + focus
                    trap come for free, so we delete the manual handlers)
    - <SelectButton> the screen-reader segmented toggle
    - Native icon groups / cycle buttons for compact view, theme, notifications
    - Command palette action
    - <Modal>       language choices, opened by a compact menu action

  The e2e DOM/ARIA contract is preserved so the shared Playwright specs keep
  passing in BOTH worlds:
    - root wrapper:  .chat-overflow-menu-wrapper
    - trigger:       button.btn-icon  (aria-label = t('moreOptions'))
    - action items:  button.overflow-menu-item  (matched by visible text)
  See e2e/diff-viewer-find.spec.ts.

  State the menu reads/writes lives in shared composables/services
  (theme, notifications, screenReaderMode), so this component owns it directly
  instead of taking a dozen props. Markdown mode lives in the command palette.
  Conversation-scoped actions (diffs, git graph, archive, export, …) are
  surfaced as events for ChatInterface to wire to its existing handlers.
-->
<template>
  <div class="chat-overflow-menu-wrapper">
    <Button
      ref="triggerRef"
      class="btn-icon"
      text
      severity="secondary"
      :aria-label="t('moreOptions')"
      aria-haspopup="true"
      :aria-expanded="open"
      @click="toggle"
    >
      <OverflowDotsIcon />
      <span v-if="hasUpdate" class="version-update-dot" />
    </Button>

    <Popover
      ref="popoverRef"
      :pt="{ root: { class: 'chat-overflow-popover' }, content: { class: 'overflow-menu-panel' } }"
      @show="open = true"
      @hide="open = false"
    >
      <!-- Screen reader mode first: long menus used to clip this off-screen. -->
      <div class="overflow-menu-control" data-testid="screen-reader-mode-section">
        <div class="md-toggle-label" id="screen-reader-mode-label">Screen reader</div>
        <SelectButton
          v-model="srMode"
          :options="srModeOptions"
          option-label="label"
          option-value="value"
          data-key="value"
          :allow-empty="false"
          aria-labelledby="screen-reader-mode-label"
          aria-label="Screen reader mode"
          data-testid="screen-reader-mode-toggle"
          @update:model-value="onSrModeChange"
        />
      </div>

      <!-- Command palette (search everything / quick actions) -->
      <button class="overflow-menu-item" @click="onCommandPalette">
        <svg
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          viewBox="0 0 24 24"
          class="chat-menu-icon"
          aria-hidden="true"
        >
          <path
            d="M7 9a2 2 0 1 1 2 -2v10a2 2 0 1 1 -2 -2h10a2 2 0 1 1 -2 2v-10a2 2 0 1 1 2 2h-10"
          />
        </svg>
        {{ t("commandMenu") }}
        <span class="overflow-menu-shortcut"
          ><kbd>{{ menuShortcutLabel("commandPalette") }}</kbd></span
        >
      </button>
      <div class="overflow-menu-divider" />

      <!-- Conversation / workspace actions -->
      <button v-if="hasCwd" class="overflow-menu-item" @click="onDiffs">
        <!-- Diffs: two rows of +/- changes -->
        <svg
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          viewBox="0 0 24 24"
          class="chat-menu-icon"
          aria-hidden="true"
        >
          <path d="M4 7h4M6 5v4" />
          <path d="M14 7h6" />
          <path d="M4 17h6" />
          <path d="M14 17h6M17 15v4" />
        </svg>
        {{ t("diffs") }}
        <span class="overflow-menu-shortcut"
          ><kbd>{{ menuShortcutLabel("diffs") }}</kbd></span
        >
      </button>
      <button v-if="hasCwd" class="overflow-menu-item" @click="onGitGraph">
        <!-- Git graph: commits A (top) and B (top-right) branching from C (bottom) -->
        <svg
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          viewBox="0 0 24 24"
          class="chat-menu-icon"
          aria-hidden="true"
        >
          <path d="M6 16.6V7.4" />
          <path d="M6 16.6C8 11 12 6 14.6 5" />
          <circle cx="6" cy="5" r="2.4" />
          <circle cx="17" cy="5" r="2.4" />
          <circle cx="6" cy="19" r="2.4" />
        </svg>
        {{ t("gitGraph") }}
        <span class="overflow-menu-shortcut"
          ><kbd>{{ menuShortcutLabel("gitGraph") }}</kbd></span
        >
      </button>
      <button class="overflow-menu-item" @click="onTerminal">
        <i class="pi pi-desktop chat-menu-icon" aria-hidden="true" />
        {{ t("terminal") }}
        <span class="overflow-menu-shortcut"
          ><kbd>{{ menuShortcutLabel("terminal") }}</kbd></span
        >
      </button>
      <button v-if="showDirectory" class="overflow-menu-item" @click="onDirectory">
        <i class="pi pi-folder chat-menu-icon" aria-hidden="true" />
        {{ t("directory") }}
        <span class="overflow-menu-cwd" :title="cwd">{{ tildifyPath(cwd) }}</span>
      </button>

      <!-- Custom server-provided links (icon is a raw SVG path) -->
      <button
        v-for="(link, index) in links"
        :key="index"
        class="overflow-menu-item"
        @click="onExternalLink(link.url)"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="chat-menu-icon">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            :stroke-width="2"
            :d="
              link.icon_svg ||
              'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14'
            "
          />
        </svg>
        {{ link.title }}
      </button>

      <template v-if="canArchive">
        <div class="overflow-menu-divider" />
        <button class="overflow-menu-item" @click="onArchive">
          <i class="pi pi-inbox chat-menu-icon" aria-hidden="true" />
          {{ t("archiveConversation") }}
          <span class="overflow-menu-shortcut"
            ><kbd>{{ menuShortcutLabel("archive") }}</kbd></span
          >
        </button>
      </template>

      <template v-if="canExport">
        <div class="overflow-menu-divider" />
        <button class="overflow-menu-item" @click="onExport">
          <i class="pi pi-download chat-menu-icon" aria-hidden="true" />
          {{ t("exportConversation") }}
          <span class="overflow-menu-shortcut"
            ><kbd>{{ menuShortcutLabel("export") }}</kbd></span
          >
        </button>
      </template>

      <div class="overflow-menu-divider" />
      <button class="overflow-menu-item" @click="onEditAgentsMd">
        <i class="pi pi-pencil chat-menu-icon" aria-hidden="true" />
        {{ t("editUserAgentsMd") }}
        <span class="overflow-menu-shortcut"
          ><kbd>{{ menuShortcutLabel("editAgentsMd") }}</kbd></span
        >
      </button>
      <button class="overflow-menu-item" @click="onEditFile">
        <i class="pi pi-file-edit chat-menu-icon" aria-hidden="true" />
        {{ t("editFile") }}
        <span class="overflow-menu-shortcut" v-tooltip.bottom="t('editFileShortcut')"
          ><kbd>{{ menuShortcutLabel("editFile") }}</kbd></span
        >
      </button>

      <div class="overflow-menu-divider" />
      <button class="overflow-menu-item" @click="onCheckVersion">
        <i class="pi pi-refresh chat-menu-icon" aria-hidden="true" />
        {{ t("checkForNewVersion") }}
        <span v-if="hasUpdate" class="version-menu-dot" />
        <span class="overflow-menu-shortcut"
          ><kbd>{{ menuShortcutLabel("checkVersion") }}</kbd></span
        >
      </button>

      <!-- Compact view/theme/notification controls -->
      <div class="overflow-menu-divider" />
      <div class="overflow-quick-controls">
        <button
          type="button"
          class="overflow-quick-control"
          data-testid="conversation-view-toggle"
          :aria-label="conversationViewLabel"
          :aria-pressed="conversationViewMode === 'end-of-turn'"
          :title="conversationViewLabel"
          @click="toggleConversationView"
        >
          <span class="overflow-quick-label">{{ t("brevity") }}</span>
          <span class="overflow-choice-stage" aria-hidden="true">
            <Transition name="choice-rotate" mode="out-in">
              <svg
                :key="conversationViewMode"
                class="overflow-choice-current"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <template v-if="conversationViewMode === 'all'">
                  <path d="M8 6h12M8 12h12M8 18h12" stroke-width="2" stroke-linecap="round" />
                  <circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none" />
                  <circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" />
                  <circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" />
                </template>
                <template v-else>
                  <path d="M8 7h12M8 17h12" stroke-width="2" stroke-linecap="round" />
                  <circle cx="4" cy="7" r="1.4" fill="currentColor" stroke="none" />
                  <path
                    d="m2.7 17 1.1 1.1 2.3-2.5"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </template>
              </svg>
            </Transition>
          </span>
          <span class="overflow-choice-alternatives" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <template v-if="conversationViewMode === 'all'">
                <path d="M8 7h12M8 17h12" stroke-width="2" stroke-linecap="round" />
                <circle cx="4" cy="7" r="1.4" fill="currentColor" stroke="none" />
                <path
                  d="m2.7 17 1.1 1.1 2.3-2.5"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </template>
              <template v-else>
                <path d="M8 6h12M8 12h12M8 18h12" stroke-width="2" stroke-linecap="round" />
                <circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" />
              </template>
            </svg>
          </span>
          <span class="sr-only-label">{{ conversationViewLabel }}</span>
        </button>

        <button
          type="button"
          class="overflow-quick-control"
          data-testid="theme-cycle"
          :aria-label="themeLabel"
          :title="themeLabel"
          @click="cycleTheme"
        >
          <span class="overflow-quick-label">{{ t("look") }}</span>
          <span class="overflow-choice-stage" aria-hidden="true">
            <Transition name="choice-rotate" mode="out-in">
              <i :key="theme" :class="['pi', themeIcon, 'overflow-choice-current']" />
            </Transition>
          </span>
          <span class="overflow-choice-alternatives" aria-hidden="true">
            <i v-for="choice in otherThemes" :key="choice" :class="['pi', themeIconFor(choice)]" />
          </span>
          <span class="sr-only-label">{{ themeLabel }}</span>
        </button>

        <button
          v-if="notificationSupported"
          type="button"
          class="overflow-quick-control"
          data-testid="notification-toggle"
          :disabled="notifBlocked && !notifEnabled"
          :aria-label="notificationLabel"
          :aria-pressed="notifEnabled"
          :title="notificationLabel"
          @click="toggleNotifications"
        >
          <span class="overflow-quick-label">{{ t("notifications") }}</span>
          <span class="overflow-choice-stage" aria-hidden="true">
            <Transition name="choice-rotate" mode="out-in">
              <i
                :key="String(notifEnabled)"
                :class="[
                  'pi',
                  notifEnabled ? 'pi-bell' : 'pi-bell-slash',
                  'overflow-choice-current',
                ]"
              />
            </Transition>
          </span>
          <span class="overflow-choice-alternatives" aria-hidden="true">
            <i :class="['pi', notifEnabled ? 'pi-bell-slash' : 'pi-bell']" />
          </span>
          <span class="sr-only-label">{{ notificationLabel }}</span>
        </button>
      </div>

      <!-- Language -->
      <div class="overflow-menu-divider" />
      <button class="overflow-menu-item" aria-haspopup="dialog" @click="onLanguagePicker">
        <i class="pi pi-globe chat-menu-icon" aria-hidden="true" />
        {{ t("switchLanguage") }}
        <span class="overflow-menu-language">{{ currentLanguage.label }}</span>
      </button>
    </Popover>

    <Modal
      :is-open="languagePickerOpen"
      :title="t('switchLanguage')"
      class-name="language-picker-modal"
      @close="languagePickerOpen = false"
    >
      <div
        ref="languageOptionsRef"
        class="language-picker-options"
        role="group"
        :aria-label="t('language')"
      >
        <button
          v-for="option in languageOptions"
          :key="option.locale"
          type="button"
          class="language-picker-option"
          :aria-pressed="locale === option.locale"
          @click="onLangChange(option.locale)"
        >
          <span class="language-dropdown-flag" aria-hidden="true">{{ option.flag }}</span>
          <span>{{ option.label }}</span>
          <i
            v-if="locale === option.locale"
            class="pi pi-check language-picker-check"
            aria-hidden="true"
          />
        </button>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import Popover from "primevue/popover";
import Button from "primevue/button";
import SelectButton from "primevue/selectbutton";
import Modal from "./Modal.vue";
import OverflowDotsIcon from "./OverflowDotsIcon.vue";
import type { Link } from "../../types";
import type { Locale } from "../../i18n/types";
import { useI18n } from "../composables/i18n";
import { useScreenReaderMode } from "../composables/screenReaderMode";
import { announceA11y } from "../../services/a11yAnnouncer";
import { useConversationView } from "../composables/conversationView";
import { menuShortcutLabel } from "../../utils/menuShortcuts";
import { tildifyPath } from "../../utils/tildify";
import { type ThemeMode, getStoredTheme, setStoredTheme, applyTheme } from "../../services/theme";
import {
  isChannelEnabled,
  setChannelEnabled,
  getBrowserNotificationState,
  requestBrowserNotificationPermission,
} from "../../services/notifications";

defineProps<{
  hasCwd: boolean;
  showDirectory: boolean;
  cwd: string;
  links: Link[];
  canArchive: boolean;
  canExport: boolean;
  hasUpdate: boolean;
}>();

const emit = defineEmits<{
  (e: "open-command-palette"): void;
  (e: "open-directory-picker"): void;
  (e: "open-diffs"): void;
  (e: "open-git-graph"): void;
  (e: "open-terminal"): void;
  (e: "open-external-link", url: string): void;
  (e: "archive"): void;
  (e: "export"): void;
  (e: "edit-agents-md"): void;
  (e: "edit-file"): void;
  (e: "check-version"): void;
}>();

const { t, locale, setLocale } = useI18n();
const { screenReaderMode, setScreenReaderMode } = useScreenReaderMode();
const { conversationViewMode, setConversationViewMode } = useConversationView();
const conversationViewLabel = computed(() => {
  const current =
    conversationViewMode.value === "all" ? t("seeAllMessages") : t("seeEndOfTurnMessagesOnly");
  const next =
    conversationViewMode.value === "all" ? t("seeEndOfTurnMessagesOnly") : t("seeAllMessages");
  return `${current} → ${next}`;
});
function toggleConversationView() {
  setConversationViewMode(conversationViewMode.value === "all" ? "end-of-turn" : "all");
}

const triggerRef = ref<{ $el: HTMLButtonElement } | null>(null);
const popoverRef = ref<InstanceType<typeof Popover> | null>(null);
const open = ref(false);

function toggle(event: MouseEvent) {
  popoverRef.value?.toggle(event);
}
function hide() {
  popoverRef.value?.hide();
}

// Each action emits its event, then closes the Popover. Kept as explicit
// one-liners (rather than a union-typed helper) so defineEmits' per-event
// overloads type-check cleanly.
const onCommandPalette = () => (emit("open-command-palette"), hide());
const onDirectory = () => (emit("open-directory-picker"), hide());
const onDiffs = () => (emit("open-diffs"), hide());
const onGitGraph = () => (emit("open-git-graph"), hide());
const onTerminal = () => (emit("open-terminal"), hide());
const onArchive = () => (emit("archive"), hide());
const onExport = () => (emit("export"), hide());
const onEditAgentsMd = () => (emit("edit-agents-md"), hide());
const onEditFile = () => (emit("edit-file"), hide());
const onCheckVersion = () => (emit("check-version"), hide());
function onExternalLink(url: string) {
  emit("open-external-link", url);
  hide();
}

const notificationSupported = typeof Notification !== "undefined";

// ---- Theme cycle (System → Light → Dark) ----
const theme = ref<ThemeMode>(getStoredTheme());
const themeOrder: ThemeMode[] = ["system", "light", "dark"];
const nextTheme = computed(
  () => themeOrder[(themeOrder.indexOf(theme.value) + 1) % themeOrder.length],
);
function themeIconFor(mode: ThemeMode): string {
  if (mode === "light") return "pi-sun";
  if (mode === "dark") return "pi-moon";
  return "pi-desktop";
}
const themeIcon = computed(() => themeIconFor(theme.value));
const otherThemes = computed(() => themeOrder.filter((choice) => choice !== theme.value));
const themeLabel = computed(() => `${t(theme.value)} → ${t(nextTheme.value)}`);
function cycleTheme() {
  theme.value = nextTheme.value;
  setStoredTheme(theme.value);
  applyTheme(theme.value);
}

// ---- Browser notifications (on / off) ----
const notifEnabled = ref<boolean>(isChannelEnabled("browser"));
const notifBlocked = ref(getBrowserNotificationState() === "denied");
const notificationLabel = computed(() => {
  if (notifBlocked.value && !notifEnabled.value) return t("blockedByBrowser");
  return notifEnabled.value ? t("disableNotifications") : t("enableNotifications");
});
async function toggleNotifications() {
  if (notifEnabled.value) {
    setChannelEnabled("browser", false);
    notifEnabled.value = false;
    return;
  }
  notifEnabled.value = await requestBrowserNotificationPermission();
  notifBlocked.value = getBrowserNotificationState() === "denied";
}

// ---- Screen reader mode (Off / On) — expands tool output automatically ----
// Labels spell out the concrete value (AGENTS: never surface bare "default").
const srMode = ref<boolean>(screenReaderMode.value);
const srModeOptions = [
  { value: false, label: "Off" },
  { value: true, label: "On (expand tools)" },
];
function onSrModeChange(on: boolean) {
  srMode.value = on;
  setScreenReaderMode(on);
  announceA11y(
    on ? "Screen reader mode on. Tool output stays expanded." : "Screen reader mode off.",
  );
}

// ---- Language picker ----
interface LanguageOption {
  locale: Locale;
  flag: string;
  label: string;
}
const languageOptions: LanguageOption[] = [
  { locale: "en", flag: "\uD83C\uDDFA\uD83C\uDDF8", label: "English" },
  { locale: "ja", flag: "\uD83C\uDDEF\uD83C\uDDF5", label: "\u65E5\u672C\u8A9E" },
  { locale: "fr", flag: "\uD83C\uDDEB\uD83C\uDDF7", label: "Fran\u00E7ais" },
  {
    locale: "ru",
    flag: "\uD83C\uDDF7\uD83C\uDDFA",
    label: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439",
  },
  { locale: "es", flag: "\uD83C\uDDEA\uD83C\uDDF8", label: "Espa\u00F1ol" },
  { locale: "zh-CN", flag: "\uD83C\uDDE8\uD83C\uDDF3", label: "\u7B80\u4F53\u4E2D\u6587" },
  { locale: "zh-TW", flag: "\uD83C\uDDF9\uD83C\uDDFC", label: "\u7E41\u9AD4\u4E2D\u6587" },
  { locale: "vi", flag: "\uD83C\uDDFB\uD83C\uDDF3", label: "Ti\u1EBFng Vi\u1EC7t" },
  { locale: "upgoer5", flag: "\uD83D\uDE80", label: "Up-Goer Five" },
];
const currentLanguage = computed(() => languageOptions.find((o) => o.locale === locale.value)!);
const languagePickerOpen = ref(false);
const languageOptionsRef = ref<HTMLDivElement | null>(null);

async function onLanguagePicker() {
  hide();
  // The menu item disappears, so let the dialog restore focus to the menu trigger.
  triggerRef.value?.$el.focus();
  languagePickerOpen.value = true;
  await nextTick();
  languageOptionsRef.value?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
}
function onLangChange(l: Locale) {
  setLocale(l);
  languagePickerOpen.value = false;
}
</script>
