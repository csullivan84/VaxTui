const SCREEN_READER_MODE_KEY = "shelley-screen-reader-mode";

/** When on, tool/terminal bodies stay expanded and auto-expand on completion. */
export function getScreenReaderMode(): boolean {
  return localStorage.getItem(SCREEN_READER_MODE_KEY) === "1";
}

export function setScreenReaderMode(on: boolean): void {
  if (on) localStorage.setItem(SCREEN_READER_MODE_KEY, "1");
  else localStorage.removeItem(SCREEN_READER_MODE_KEY);
}
