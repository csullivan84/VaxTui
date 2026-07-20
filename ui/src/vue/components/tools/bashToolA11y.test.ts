import {
  bashCompletionAnnouncement,
  completionKind,
  shortCommand,
  terminalOutputLabel,
  terminalToggleLabel,
} from "./bashToolA11y";

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}

check("shortCommand trims whitespace", shortCommand("  ls   -la  "), "ls -la");
check(
  "shortCommand truncates",
  shortCommand("a".repeat(100), 10),
  "aaaaaaaaaa…",
);

check(
  "output label includes command",
  terminalOutputLabel("ls -la"),
  "Terminal output for `ls -la`",
);

check(
  "toggle expand label",
  terminalToggleLabel(false, "pwd"),
  "Expand terminal output for `pwd`",
);
check(
  "toggle collapse label",
  terminalToggleLabel(true, "pwd"),
  "Collapse terminal output for `pwd`",
);

check(
  "success announce",
  bashCompletionAnnouncement("ls", "success"),
  "Command finished: `ls`",
);
check(
  "error announce",
  bashCompletionAnnouncement("false", "error"),
  "Command failed: `false`",
);
check(
  "cancelled announce",
  bashCompletionAnnouncement("sleep 9", "cancelled"),
  "Command cancelled: `sleep 9`",
);

check("kind success", completionKind(false, false), "success");
check("kind error", completionKind(true, false), "error");
check("kind cancelled", completionKind(true, true), "cancelled");

console.log("bashToolA11y tests passed");
