export type A11yTraceKind = "announcement" | "focus" | "keyboard";

export interface A11yTraceEvent {
  at: string;
  kind: A11yTraceKind;
  detail: string;
}

const STORAGE_KEY = "shelley-a11y-trace";
const MAX_EVENTS = 200;
let initialized = false;

function readTrace(): A11yTraceEvent[] {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as A11yTraceEvent[];
  if (!Array.isArray(parsed)) throw new Error("Invalid accessibility trace");
  return parsed;
}

export function recordA11yTrace(kind: A11yTraceKind, detail: string): void {
  const events = readTrace();
  events.push({ at: new Date().toISOString(), kind, detail });
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
}

function describeElement(element: HTMLElement): string {
  const role = element.getAttribute("role") || element.tagName.toLowerCase();
  const name =
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) ||
    "unnamed";
  return `${role}: ${name}`;
}

export function initializeA11yTrace(): void {
  if (initialized) return;
  initialized = true;
  document.addEventListener(
    "focusin",
    (event) => {
      if (event.target instanceof HTMLElement)
        recordA11yTrace("focus", describeElement(event.target));
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      const keys = [
        event.ctrlKey && "Control",
        event.metaKey && "Meta",
        event.altKey && "Alt",
        event.shiftKey && "Shift",
        event.key,
      ]
        .filter(Boolean)
        .join("+");
      recordA11yTrace("keyboard", keys);
    },
    true,
  );
  (window as Window & { exportShelleyA11yTrace?: () => string }).exportShelleyA11yTrace =
    exportA11yTrace;
}

export function exportA11yTrace(): string {
  return JSON.stringify(readTrace(), null, 2);
}

export function downloadA11yTrace(): void {
  const url = URL.createObjectURL(new Blob([exportA11yTrace()], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `shelley-a11y-trace-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
