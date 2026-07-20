<template>
  <Modal
    :is-open="isOpen"
    title="Keyboard shortcuts and accessibility"
    class-name="modal-wide"
    @close="emit('close')"
  >
    <section aria-labelledby="shortcut-heading">
      <h3 id="shortcut-heading">Keyboard shortcuts</h3>
      <dl class="a11y-shortcut-list">
        <template v-for="shortcut in shortcuts" :key="shortcut.keys">
          <dt>
            <kbd>{{ shortcut.keys }}</kbd>
          </dt>
          <dd>{{ shortcut.action }}</dd>
        </template>
      </dl>
    </section>

    <section aria-labelledby="preference-heading">
      <h3 id="preference-heading">Screen reader preferences</h3>
      <label class="a11y-preference-row">
        <input
          type="checkbox"
          :checked="strict"
          @change="setStrict(($event.target as HTMLInputElement).checked)"
        />
        Strict accessibility mode (forces screen-reader mode in this browser)
      </label>
      <label class="a11y-preference-row">
        Send messages with
        <select
          :value="sendKeystroke"
          @change="changeSendKeystroke(($event.target as HTMLSelectElement).value)"
        >
          <option value="enter">Enter</option>
          <option value="modifier-enter">Control or Command+Enter</option>
        </select>
      </label>
      <fieldset v-if="tools.length" class="a11y-tool-preferences">
        <legend>Muted tool completion announcements</legend>
        <label class="a11y-preference-row">
          Filter tool output from the last turn
          <input v-model="toolQuery" type="search" />
        </label>
        <p role="status">{{ filteredTools.length }} matching tools</p>
        <label v-for="tool in filteredTools" :key="tool.name" class="a11y-preference-row">
          <input
            type="checkbox"
            :checked="muted.has(tool.name)"
            @change="setMuted(tool.name, ($event.target as HTMLInputElement).checked)"
          />
          {{ tool.name }}<span v-if="tool.summary"> — {{ tool.summary }}</span>
        </label>
      </fieldset>
    </section>

    <section aria-labelledby="export-heading">
      <h3 id="export-heading">Tool transcript</h3>
      <button
        type="button"
        class="status-button status-button-primary"
        :disabled="!canExportTools"
        @click="emit('export-tools')"
      >
        Download last turn tools as text
      </button>
      <button type="button" class="status-button" @click="downloadTrace">
        Download accessibility event trace
      </button>
    </section>
  </Modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  getA11yStrict,
  getMutedToolAnnouncements,
  getSendKeystroke,
  setA11yStrict,
  setSendKeystroke,
  setToolAnnouncementMuted,
  type SendKeystroke,
} from "../../services/a11yPreferences";
import { announceA11y } from "../../services/a11yAnnouncer";
import { downloadA11yTrace } from "../../services/a11yTrace";
import Modal from "./Modal.vue";

const props = defineProps<{
  isOpen: boolean;
  tools: Array<{ name: string; summary: string }>;
  canExportTools: boolean;
}>();
const emit = defineEmits<{ (e: "close"): void; (e: "export-tools"): void }>();
const strict = ref(getA11yStrict());
const muted = ref(new Set(getMutedToolAnnouncements()));
const sendKeystroke = ref<SendKeystroke>(getSendKeystroke());
const toolQuery = ref("");
const filteredTools = computed(() => {
  const query = toolQuery.value.trim().toLowerCase();
  if (!query) return props.tools;
  return props.tools.filter((tool) => `${tool.name} ${tool.summary}`.toLowerCase().includes(query));
});
const shortcuts = [
  { keys: "?", action: "Open this help dialog" },
  { keys: "Enter", action: "Send from the message composer" },
  { keys: "Shift+Enter", action: "Insert a new line in the composer" },
  { keys: "Alt+Arrow Up or Down", action: "Move between code blocks in a message" },
  { keys: "Control or Command+Shift+C", action: "Copy the focused code block" },
  {
    keys: "Control or Command+K",
    action: "Open the command palette, including on mobile with an external keyboard",
  },
  { keys: "Control or Command+Arrow Down", action: "Move to the end of the transcript" },
  { keys: "Escape", action: "Close the active dialog" },
  { keys: "Up or Down", action: "Move between commits in the Git graph" },
];

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    strict.value = getA11yStrict();
    muted.value = new Set(getMutedToolAnnouncements());
    sendKeystroke.value = getSendKeystroke();
  },
);
function setStrict(on: boolean) {
  strict.value = on;
  setA11yStrict(on);
  announceA11y(`Strict accessibility mode ${on ? "on" : "off"}.`);
}
function changeSendKeystroke(value: string) {
  const next: SendKeystroke = value === "modifier-enter" ? "modifier-enter" : "enter";
  sendKeystroke.value = next;
  setSendKeystroke(next);
  announceA11y(
    `Messages now send with ${next === "enter" ? "Enter" : "Control or Command plus Enter"}.`,
  );
}
function setMuted(name: string, on: boolean) {
  setToolAnnouncementMuted(name, on);
  muted.value = new Set(getMutedToolAnnouncements());
  announceA11y(`${name} completion announcements ${on ? "muted" : "enabled"}.`);
}
function downloadTrace() {
  downloadA11yTrace();
  announceA11y("Accessibility event trace downloaded.");
}
</script>
