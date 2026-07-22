import { countTurnToolStats } from "./turnToolStats";

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

const llm = (Content: unknown[]) => JSON.stringify({ Content });

check("empty", countTurnToolStats([]), { total: 0, succeeded: 0, failed: 0 });

check(
  "counts results after last user",
  countTurnToolStats([
    { type: "user", llm_data: llm([{ Type: 2, Text: "do stuff" }]) },
    { type: "agent", llm_data: llm([{ Type: 5, ToolName: "bash" }]) },
    {
      type: "user",
      llm_data: llm([
        { Type: 6, ToolUseID: "1", ToolError: false },
        { Type: 6, ToolUseID: "2", ToolError: true },
      ]),
    },
  ]),
  { total: 2, succeeded: 1, failed: 1 },
);

check(
  "ignores prior turn tools",
  countTurnToolStats([
    { type: "user", llm_data: llm([{ Type: 2, Text: "first" }]) },
    { type: "user", llm_data: llm([{ Type: 6, ToolUseID: "old", ToolError: true }]) },
    { type: "user", llm_data: llm([{ Type: 2, Text: "second" }]) },
    { type: "user", llm_data: llm([{ Type: 6, ToolUseID: "new", ToolError: false }]) },
  ]),
  { total: 1, succeeded: 1, failed: 0 },
);

console.log("turnToolStats tests passed");
