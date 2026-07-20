import assert from "node:assert/strict";
import { linearDiff } from "./linearDiff";

assert.deepEqual(linearDiff("a\nb\nc", "a\nx\nc"), [
  { kind: "context", text: "a" },
  { kind: "removed", text: "b" },
  { kind: "added", text: "x" },
  { kind: "context", text: "c" },
]);

assert.deepEqual(linearDiff("a\nb\nc\nd", "a\nx\nc\ny\nd"), [
  { kind: "context", text: "a" },
  { kind: "removed", text: "b" },
  { kind: "added", text: "x" },
  { kind: "context", text: "c" },
  { kind: "added", text: "y" },
  { kind: "context", text: "d" },
]);

console.log("linear diff tests passed");
