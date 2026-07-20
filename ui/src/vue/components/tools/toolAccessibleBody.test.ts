/**
 * Pure structural checks for ToolAccessibleBody contract (no Vue mount harness).
 * Documents the a11y boundary so a missing plainText/label regresses loudly.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "ToolAccessibleBody.vue"), "utf8");

function check(name: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${name}`);
}

check("sr-only region when collapsed", src.includes('class="sr-only"') && src.includes("!expanded"));
check("role=region on collapsed body", src.includes('role="region"'));
check("aria-label bound", src.includes(":aria-label=\"label\""));
check("pre for line-break navigation", src.includes("<pre"));
check("v-show for expanded (keeps DOM)", src.includes("v-show=\"expanded\""));
check("data-testid tool-output-sr", src.includes('data-testid="tool-output-sr"'));
check("plainText prop exists", src.includes("plainText"));
check("no display:none pattern for collapsed", !src.includes("display: none"));

console.log("toolAccessibleBody tests passed");
