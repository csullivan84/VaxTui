import {
  agentAnnouncement,
  cancelAnnouncement,
  errorAnnouncement,
  formatToolTurnSummary,
  streamAnnouncement,
} from "./statusAnnouncer";

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

check("idle mount stays silent", agentAnnouncement(false, undefined), null);
check("working starts", agentAnnouncement(true, false), {
  text: "Agent working",
  politeness: "polite",
});
check("working finishes", agentAnnouncement(false, true), {
  text: "Agent finished",
  politeness: "polite",
});
check("working finishes with tools", agentAnnouncement(false, true, 3), {
  text: "Agent finished. 3 tools completed.",
  politeness: "polite",
});
check(
  "working finishes with assistant preview",
  agentAnnouncement(false, true, 1, "The build is green."),
  {
    text: "Agent finished. 1 tool completed. Response: The build is green.",
    politeness: "polite",
  },
);
check(
  "working finishes with success and fail",
  agentAnnouncement(false, true, 0, "Done.", false, {
    total: 3,
    succeeded: 2,
    failed: 1,
  }),
  {
    text: "Agent finished. 3 tools: 2 succeeded, 1 failed. Response: Done.",
    politeness: "polite",
  },
);
check("cancel path is not finished", agentAnnouncement(false, true, 2, "x", true), {
  text: "Cancelled.",
  politeness: "polite",
});
check(
  "cancel with subagents",
  agentAnnouncement(false, true, 0, "", true, null, 2),
  {
    text: "Cancelled, including 2 subagents.",
    politeness: "polite",
  },
);
check("unchanged idle state stays silent", agentAnnouncement(false, false), null);

check("format all succeeded", formatToolTurnSummary({ total: 2, succeeded: 2, failed: 0 }), "2 tools completed.");
check("format all failed", formatToolTurnSummary({ total: 1, succeeded: 0, failed: 1 }), "1 tool failed.");

check("cancel no subagents", cancelAnnouncement(0), {
  text: "Cancelled.",
  politeness: "polite",
});
check("cancel one subagent", cancelAnnouncement(1), {
  text: "Cancelled, including 1 subagent.",
  politeness: "polite",
});
check("cancel many subagents", cancelAnnouncement(3), {
  text: "Cancelled, including 3 subagents.",
  politeness: "polite",
});

check("disconnect is assertive", streamAnnouncement("disconnected", "connected"), {
  text: "Disconnected",
  politeness: "assertive",
});
check("reconnection is polite", streamAnnouncement("connected", "disconnected"), {
  text: "Connected",
  politeness: "polite",
});

check("error is assertive", errorAnnouncement("Request failed", null), {
  text: "Request failed",
  politeness: "assertive",
});
check(
  "unchanged errors are announced once",
  errorAnnouncement("Request failed", "Request failed"),
  null,
);
check("cleared errors clear the live region", errorAnnouncement(null, "Request failed"), {
  text: "",
  politeness: "polite",
});

console.log("statusAnnouncer tests passed");
