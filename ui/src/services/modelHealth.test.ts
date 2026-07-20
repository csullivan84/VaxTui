import {
  modelHealthText,
  recordModelError,
  recordModelFirstContent,
  recordModelRequestStart,
  resetModelHealthForTests,
} from "./modelHealth";

resetModelHealthForTests();
if (modelHealthText("model-a") !== "no data yet") throw new Error("empty health text");
recordModelRequestStart("model-a", 1_000);
if (modelHealthText("model-a") !== "last: waiting…") throw new Error("pending health text");
recordModelFirstContent("model-a", 2_240);
if (modelHealthText("model-a") !== "last: 1.2s · ok") throw new Error("latency health text");
recordModelError("model-a", "provider\nfailed");
if (modelHealthText("model-a") !== "last error: provider failed") {
  throw new Error("error health text");
}

console.log("modelHealth tests passed");
