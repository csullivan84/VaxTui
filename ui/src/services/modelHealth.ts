export interface ModelHealthEntry {
  modelId: string;
  requestStartedAt: number;
  firstContentAt?: number;
  lastError?: string;
}

const MAX_ENTRIES = 20;
const entries: ModelHealthEntry[] = [];

function latest(modelId: string): ModelHealthEntry | undefined {
  return entries.find((entry) => entry.modelId === modelId);
}

export function recordModelRequestStart(modelId: string, now = Date.now()): void {
  const index = entries.findIndex((entry) => entry.modelId === modelId);
  if (index >= 0) entries.splice(index, 1);
  entries.unshift({ modelId, requestStartedAt: now });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
}

export function recordModelFirstContent(modelId: string, now = Date.now()): boolean {
  const entry = latest(modelId);
  if (!entry || entry.firstContentAt !== undefined) return false;
  entry.firstContentAt = now;
  return true;
}

export function recordModelError(modelId: string, error: string): void {
  const entry = latest(modelId);
  if (!entry) return;
  entry.lastError = error.replace(/\s+/g, " ").trim().slice(0, 120) || "Unknown error";
}

export function modelHealthText(modelId: string): string {
  const entry = latest(modelId);
  if (!entry) return "no data yet";
  if (entry.lastError) return `last error: ${entry.lastError}`;
  if (entry.firstContentAt !== undefined) {
    return `last: ${((entry.firstContentAt - entry.requestStartedAt) / 1000).toFixed(1)}s · ok`;
  }
  return "last: waiting…";
}

export function resetModelHealthForTests(): void {
  entries.length = 0;
}
