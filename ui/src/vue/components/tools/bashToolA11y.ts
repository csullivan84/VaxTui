/** Pure helpers for BashTool accessibility labels and announcements. */

export function shortCommand(command: string, maxLen = 80): string {
  const oneLine = command.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, maxLen) + "…";
}

/** Region label always available to screen readers (collapsed or expanded). */
export function terminalOutputLabel(command: string): string {
  const cmd = shortCommand(command) || "command";
  return `Terminal output for \`${cmd}\``;
}

export function terminalToggleLabel(expanded: boolean, command: string): string {
  const cmd = shortCommand(command) || "command";
  return expanded
    ? `Collapse terminal output for \`${cmd}\``
    : `Expand terminal output for \`${cmd}\``;
}

export type BashCompletionKind = "success" | "error" | "cancelled";

export function bashCompletionAnnouncement(
  command: string,
  kind: BashCompletionKind,
): string {
  const cmd = shortCommand(command) || "command";
  if (kind === "cancelled") return `Command cancelled: \`${cmd}\``;
  if (kind === "error") return `Command failed: \`${cmd}\``;
  return `Command finished: \`${cmd}\``;
}

export function completionKind(
  hasError: boolean | undefined,
  cancelled: boolean,
): BashCompletionKind {
  if (cancelled) return "cancelled";
  if (hasError) return "error";
  return "success";
}
