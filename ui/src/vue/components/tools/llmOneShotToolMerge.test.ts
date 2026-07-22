/**
 * Structural regression checks for the upstream prompt-files/image merge.
 * The fork must retain its collapsed-output and keyboard accessibility contract.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "LLMOneShotTool.vue"), "utf8");

function check(name: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${name}`);
}

check("accepts prompt_files", src.includes("prompt_files?: string[] | string"));
check("renders all prompt files", src.includes('promptFiles.join("\\n")'));
check("renders upstream image previews", src.includes('v-if="displayImages.length"'));
check(
  "gives image previews alt text",
  src.includes(":alt=\"`Image: ${img.path || 'attachment'}`\""),
);
check("uses accessible collapsed body", src.includes("<ToolAccessibleBody"));
check("passes collapsed plain text", src.includes(':plain-text="collapsedPlainText"'));
check(
  "collapsed text names prompt files",
  src.includes('`Prompt files:\\n${promptFiles.value.join("\\n")'),
);
check("header remains keyboard operable", src.includes("@keydown.enter.prevent"));
check("toggle label remains descriptive", src.includes("Expand LLM one-shot result"));

console.log("llmOneShotTool merge tests passed");
