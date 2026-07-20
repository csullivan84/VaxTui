export type Politeness = "polite" | "assertive";
export type StreamStatus = "connected" | "reconnecting" | "disconnected";

export interface Announcement {
  text: string;
  politeness: Politeness;
}

export function agentAnnouncement(
  working: boolean,
  wasWorking: boolean | undefined,
): Announcement | null {
  if (working === wasWorking) return null;
  if (working) return { text: "Agent working", politeness: "polite" };
  if (wasWorking) return { text: "Agent finished", politeness: "polite" };
  return null;
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
