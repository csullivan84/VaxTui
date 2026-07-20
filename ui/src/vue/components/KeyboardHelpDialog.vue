<template>
  <Modal :is-open="isOpen" title="Keyboard shortcuts and accessibility" class-name="modal-wide" @close="emit('close')">
    <section aria-labelledby="shortcut-heading">
      <h3 id="shortcut-heading">Keyboard shortcuts</h3>
      <dl class="a11y-shortcut-list">
        <template v-for="shortcut in shortcuts" :key="shortcut.keys">
          <dt><kbd>{{ shortcut.keys }}</kbd></dt>
          <dd>{{ shortcut.action }}</dd>
        </template>
      </dl>
    </section>

    <section aria-labelledby="preference-heading">
      <h3 id="preference-heading">Screen reader preferences</h3>
      <label class="a11y-preference-row">
        <input type="checkbox" :checked="strict" @change="setStrict(($event.target as HTMLInputElement).checked)" />
        Strict accessibility mode (forces screen-reader mode in this browser)
      </label>
      <fieldset v-if="tools.length" class="a11y-tool-preferences">
        <legend>Muted tool completion announcements</legend>
        <label v-for="tool in tools" :key="tool.name" class="a11y-preference-row">
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
      <button type="button" class="status-button status-button-primary" :disabled="!canExportTools" @click="emit('export-tools')">
        Download last turn tools as text
      </button>
    </section>
  </Modal>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { getA11yStrict, getMutedToolAnnouncements, setA11yStrict, setToolAnnouncementMuted } from "../../services/a11yPreferences";
import { announceA11y } from "../../services/a11yAnnouncer";
import Modal from "./Modal.vue";

const props = defineProps<{ isOpen: boolean; tools: Array<{ name: string; summary: string }>; canExportTools: boolean }>();
const emit = defineEmits<{ (e: "close"): void; (e: "export-tools"): void }>();
const strict = ref(getA11yStrict());
const muted = ref(new Set(getMutedToolAnnouncements()));
const shortcuts = [
  { keys: "?", action: "Open this help dialog" },
  { keys: "Enter", action: "Send from the message composer" },
  { keys: "Shift+Enter", action: "Insert a new line in the composer" },
  { keys: "Control or Command+Arrow Down", action: "Move to the end of the transcript" },
  { keys: "Escape", action: "Close the active dialog" },
  { keys: "Up or Down", action: "Move between commits in the Git graph" },
];

watch(() => props.isOpen, (open) => {
  if (!open) return;
  strict.value = getA11yStrict();
  muted.value = new Set(getMutedToolAnnouncements());
});
function setStrict(on: boolean) {
  strict.value = on;
  setA11yStrict(on);
  announceA11y(`Strict accessibility mode ${on ? "on" : "off"}.`);
}
function setMuted(name: string, on: boolean) {
  setToolAnnouncementMuted(name, on);
  muted.value = new Set(getMutedToolAnnouncements());
  announceA11y(`${name} completion announcements ${on ? "muted" : "enabled"}.`);
}
</script>
