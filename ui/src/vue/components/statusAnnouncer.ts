export type Politeness = "polite" | "assertive";
export type StreamStatus = "connected" | "reconnecting" | "disconnected";

export interface Announcement {
  text: string;
  politeness: Politeness;
}

export interface ToolTurnStats {
  total: number;
  succeeded: number;
  failed: number;
}

export function formatToolTurnSummary(stats: ToolTurnStats): string {
  if (stats.total <= 0) return "";
  const noun = stats.total === 1 ? "tool" : "tools";
  if (stats.failed === 0 && stats.succeeded === stats.total) {
    return `${stats.total} ${noun} completed.`;
  }
  if (stats.succeeded === 0 && stats.failed === stats.total) {
    return `${stats.total} ${noun} failed.`;
  }
  const parts: string[] = [];
  if (stats.succeeded > 0) parts.push(`${stats.succeeded} succeeded`);
  if (stats.failed > 0) parts.push(`${stats.failed} failed`);
  const rest = stats.total - stats.succeeded - stats.failed;
  if (rest > 0) parts.push(`${rest} other`);
  return `${stats.total} ${noun}: ${parts.join(", ")}.`;
}

export function agentAnnouncement(
  working: boolean,
  wasWorking: boolean | undefined,
  toolsCompleted = 0,
  assistantPreview = "",
  cancelled = false,
  toolStats?: ToolTurnStats | null,
  cancelledSubagents = 0,
): Announcement | null {
  if (working === wasWorking) return null;
  if (working) return { text: "Agent working", politeness: "polite" };
  if (wasWorking) {
    if (cancelled) {
      return cancelAnnouncement(cancelledSubagents);
    }
    const stats: ToolTurnStats =
      toolStats ??
      (toolsCompleted > 0
        ? { total: toolsCompleted, succeeded: toolsCompleted, failed: 0 }
        : { total: 0, succeeded: 0, failed: 0 });
    const toolPart = formatToolTurnSummary(stats);
    const preview = assistantPreview.trim();
    const response = preview ? ` Response: ${preview}` : "";
    if (toolPart) {
      return {
        text: `Agent finished. ${toolPart}${response}`,
        politeness: "polite",
      };
    }
    return {
      text: preview ? `Agent finished.${response}` : "Agent finished",
      politeness: "polite",
    };
  }
  return null;
}

export function cancelAnnouncement(cancelledSubagents: number): Announcement {
  if (cancelledSubagents <= 0) {
    return { text: "Cancelled.", politeness: "polite" };
  }
  if (cancelledSubagents === 1) {
    return { text: "Cancelled, including 1 subagent.", politeness: "polite" };
  }
  return {
    text: `Cancelled, including ${cancelledSubagents} subagents.`,
    politeness: "polite",
  };
}

export function streamAnnouncement(
  status: StreamStatus,
  previous: StreamStatus | undefined,
): Announcement | null {
  if (status === previous) return null;
  if (status === "reconnecting") return { text: "Reconnecting", politeness: "polite" };
  if (status === "disconnected") return { text: "Disconnected", politeness: "assertive" };
  if (previous === "disconnected" || previous === "reconnecting") {
    return { text: "Connected", politeness: "polite" };
  }
  return null;
}

export function errorAnnouncement(
  error: string | null,
  previous: string | null | undefined,
): Announcement | null {
  if (error === previous) return null;
  if (error) return { text: error, politeness: "assertive" };
  if (previous) return { text: "", politeness: "polite" };
  return null;
}
