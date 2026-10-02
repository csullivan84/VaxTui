/**
 * Structural regression checks for the VM integrations navigation contract.
 * The VaxTui workspace shell intentionally differs from upstream's command
 * palette E2E fixture, so keep this invariant local to the component.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "IntegrationsModal.vue"), "utf8");

function check(name: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${name}`);
}

check("labels the tab list", src.includes('role="tablist" :aria-label="t(\'vmIntegrations\')"'));
check("exposes selected state", src.includes(':aria-selected="tab === \'list\'"'));
check("connects list tab and panel", src.includes('aria-controls="integrations-list-panel"'));
check("labels list panel from its tab", src.includes('aria-labelledby="integrations-list-tab"'));
check("connects details tab and panel", src.includes('aria-controls="integrations-detail-panel"'));
check("labels details panel from its tab", src.includes('aria-labelledby="integrations-detail-tab"'));
check("announces loading states", src.includes('class="integrations-status" role="status"'));

console.log("integrationsModalA11y tests passed");
