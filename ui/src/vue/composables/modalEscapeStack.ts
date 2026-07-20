// Stack-aware Escape handling for stacked modals.
//
// PrimeVue's Dialog binds its own document-level Escape listener per instance
// with no awareness of stacking, so when modals are layered (e.g. the add/edit
// dialog on top of the Manage Models list) a single Escape closes ALL of them.
// We disable PrimeVue's built-in close-on-escape (see Modal.vue) and route
// Escape through this shared stack instead, so only the topmost open modal
// closes. Each open Modal registers its close callback; one document listener
// (installed lazily) invokes just the last-registered one.

import { isImeComposing } from "../../utils/imeComposing";

interface ModalEntry {
  close: () => void;
  restoreFocusTo: HTMLElement | null;
}

const stack: ModalEntry[] = [];

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || isImeComposing(event) || stack.length === 0) return;
  event.preventDefault();
  event.stopPropagation();
  // Close only the topmost modal.
  stack[stack.length - 1].close();
}

let listening = false;

export function pushModalEscape(close: () => void): void {
  if (!listening) {
    document.addEventListener("keydown", onKeydown);
    listening = true;
  }
  const existing = stack.findIndex((entry) => entry.close === close);
  if (existing !== -1) stack.splice(existing, 1);
  const active = document.activeElement;
  stack.push({
    close,
    restoreFocusTo: active instanceof HTMLElement ? active : null,
  });
}

export function popModalEscape(close: () => void): void {
  let i = -1;
  for (let candidate = stack.length - 1; candidate >= 0; candidate--) {
    if (stack[candidate].close === close) {
      i = candidate;
      break;
    }
  }
  if (i === -1) return;
  const [entry] = stack.splice(i, 1);
  if (i !== stack.length || !entry.restoreFocusTo?.isConnected) return;
  requestAnimationFrame(() => {
    if (entry.restoreFocusTo?.isConnected) entry.restoreFocusTo.focus();
  });
}
