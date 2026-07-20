import {
  agentAnnouncement,
  errorAnnouncement,
  streamAnnouncement,
} from "./statusAnnouncer";

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name}: ${JSON.stringify(actual)}`);
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
check("unchanged idle state stays silent", agentAnnouncement(false, false), null);

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
