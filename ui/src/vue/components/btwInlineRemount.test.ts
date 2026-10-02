import assert from "node:assert/strict";

import { mountVueComponent } from "../../../scripts/vue-component-test";
import type { BtwExchange } from "../../types";

function exchange(exchangeID: string): BtwExchange {
  return {
    exchange_id: exchangeID, parent_conversation_id: "parent", status: "completed", retryable: false,
    parent_pointer: { generation: 1, sequence_id: 1 }, created_at: "2026-10-02T20:00:00Z",
    turns: [{ id: `${exchangeID}-turn`, question: "question", answer: "answer", status: "completed", tool_call_count: 0 }],
  };
}

const fixture = await mountVueComponent("src/vue/components/BtwInline.vue", { exchange: exchange("first") });
try {
  const toggle = fixture.container.querySelector<HTMLButtonElement>(".btw-inline-label");
  const input = fixture.container.querySelector<HTMLTextAreaElement>("[data-btw-follow-up]");
  assert.ok(toggle && input, "compiled BTW reader exposes disclosure and follow-up input");
  input.value = "unsent follow-up";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  toggle.click();
  await fixture.flush();
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  const remounted = await fixture.remount();
  assert.equal(remounted.querySelector(".btw-inline-label")?.getAttribute("aria-expanded"), "false");
  assert.equal(remounted.querySelector<HTMLTextAreaElement>("[data-btw-follow-up]")?.value, "unsent follow-up");
  fixture.props.exchange = exchange("second");
  const independent = await fixture.remount();
  assert.equal(independent.querySelector(".btw-inline-label")?.getAttribute("aria-expanded"), "true");
  assert.equal(independent.querySelector<HTMLTextAreaElement>("[data-btw-follow-up]")?.value, "");
} finally { fixture.close(); }
console.log("BtwInline remount state contract passed");
