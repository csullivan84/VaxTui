const SCREEN_READER_MODE_KEY = "shelley-screen-reader-mode";
const A11Y_STRICT_KEY = "shelley-a11y-strict";
const MUTED_TOOL_ANNOUNCEMENTS_KEY = "shelley-muted-tool-announcements";

/** When on, tool/terminal bodies stay expanded and auto-expand on completion. */
export function getScreenReaderMode(): boolean {
  return getA11yStrict() || localStorage.getItem(SCREEN_READER_MODE_KEY) === "1";
}

/** Client-side feature flag: force screen-reader-first defaults for this browser. */
export function getA11yStrict(): boolean {
  return localStorage.getItem(A11Y_STRICT_KEY) === "1";
}

export function setA11yStrict(on: boolean): void {
  if (on) localStorage.setItem(A11Y_STRICT_KEY, "1");
  else localStorage.removeItem(A11Y_STRICT_KEY);
  if (on) localStorage.setItem(SCREEN_READER_MODE_KEY, "1");
}

export function getMutedToolAnnouncements(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(MUTED_TOOL_ANNOUNCEMENTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === "string") : [];
  } catch {
    return [];
  }
}

export function setToolAnnouncementMuted(toolName: string, muted: boolean): void {
  const names = new Set(getMutedToolAnnouncements());
  if (muted) names.add(toolName);
  else names.delete(toolName);
  if (names.size) localStorage.setItem(MUTED_TOOL_ANNOUNCEMENTS_KEY, JSON.stringify([...names]));
  else localStorage.removeItem(MUTED_TOOL_ANNOUNCEMENTS_KEY);
}

export function isToolAnnouncementMuted(toolName: string): boolean {
  return getMutedToolAnnouncements().includes(toolName);
}

export function setScreenReaderMode(on: boolean): void {
  if (on) localStorage.setItem(SCREEN_READER_MODE_KEY, "1");
  else localStorage.removeItem(SCREEN_READER_MODE_KEY);
}
