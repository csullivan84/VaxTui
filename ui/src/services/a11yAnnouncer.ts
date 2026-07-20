export type A11yPoliteness = "polite" | "assertive";

export const A11Y_ANNOUNCE_EVENT = "shelley:a11y-announce";

export interface A11yAnnouncementDetail {
  text: string;
  politeness: A11yPoliteness;
}

/** Sends one message through the app-level StatusAnnouncer. */
export function announceA11y(text: string, politeness: A11yPoliteness = "polite") {
  if (!text || typeof window === "undefined") return;
  void import("./a11yTrace").then(({ recordA11yTrace }) =>
    recordA11yTrace("announcement", `${politeness}: ${text}`),
  );
  window.dispatchEvent(
    new CustomEvent<A11yAnnouncementDetail>(A11Y_ANNOUNCE_EVENT, {
      detail: { text, politeness },
    }),
  );
}

/** Announces tool activity unless the user muted that tool in accessibility preferences. */
export async function announceToolA11y(
  toolName: string,
  text: string,
  politeness: A11yPoliteness = "polite",
) {
  const { isToolAnnouncementMuted } = await import("./a11yPreferences");
  if (!isToolAnnouncementMuted(toolName)) announceA11y(text, politeness);
}
