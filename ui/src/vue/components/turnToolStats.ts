import type { ToolTurnStats } from "./statusAnnouncer";

type ContentPart = {
  Type?: number;
  ToolError?: boolean;
};

type MessageLike = {
  type: string;
  llm_data?: unknown;
};

const TOOL_RESULT_TYPE = 6;

function parseContents(message: MessageLike): ContentPart[] {
  try {
    const raw = message.llm_data;
    if (!raw) return [];
    const llm =
      typeof raw === "string"
        ? (JSON.parse(raw) as { Content?: ContentPart[] })
        : (raw as { Content?: ContentPart[] });
    return Array.isArray(llm?.Content) ? llm.Content : [];
  } catch {
    return [];
  }
}

function isHumanUserMessage(message: MessageLike): boolean {
  if (message.type !== "user") return false;
  return !parseContents(message).some((c) => c.Type === TOOL_RESULT_TYPE);
}

/** Count tool results in the current turn (after the latest human user message). */
export function countTurnToolStats(messages: MessageLike[]): ToolTurnStats {
  let lastHuman = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isHumanUserMessage(messages[i])) {
      lastHuman = i;
      break;
    }
  }

  let total = 0;
  let succeeded = 0;
  let failed = 0;
  for (let i = lastHuman + 1; i < messages.length; i++) {
    for (const content of parseContents(messages[i])) {
      if (content.Type !== TOOL_RESULT_TYPE) continue;
      total++;
      if (content.ToolError) failed++;
      else succeeded++;
    }
  }
  return { total, succeeded, failed };
}
