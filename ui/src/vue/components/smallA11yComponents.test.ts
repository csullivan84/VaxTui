import { mountVueComponent } from "../../../scripts/vue-component-test";

function check(name: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${name}`);
}

async function run(name: string, test: () => Promise<void>) {
  try {
    await test();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

await run("CommitTourMedia labels a video by filename", async () => {
  const view = await mountVueComponent("src/vue/components/CommitTourMedia.vue", {
    entry: { name: "demo.webm", blob: "0123456789abcdef", mime: "video/webm" },
    src: "/api/tour/demo.webm",
  });
  try {
    const video = view.container.querySelector("video");
    check("renders video", video instanceof view.window.HTMLVideoElement);
    check("video has filename label", video?.getAttribute("aria-label") === "Video: demo.webm");
  } finally {
    view.close();
  }
});

await run("ReviewRecordingBar has one live announcement role", async () => {
  const view = await mountVueComponent("src/vue/components/ReviewRecordingBar.vue", {
    busy: false,
    error: "Upload failed",
    pending: [],
    conversationId: "conversation",
  });
  try {
    const bar = view.container.querySelector("[data-testid=review-recording-bar]");
    const error = view.container.querySelector("[data-testid=review-recording-error]");
    check("error bar is assertive", bar?.getAttribute("role") === "alert");
    check("error does not nest another live role", error?.getAttribute("role") === null);
  } finally {
    view.close();
  }
});

await run("interrupted generic tool completion never claims success", async () => {
  const view = await mountVueComponent("src/vue/components/CoalescedToolCall.vue", {
    toolName: "future_tool",
    toolInput: { task: "work" },
    toolResult: "",
    hasResult: false,
    toolInterrupted: true,
  });
  try {
    const status = view.container.querySelector(".tool-result-status");
    check("completed status is present", status !== null);
    check("status describes interruption", status?.textContent?.includes("interrupted.") === true);
    check("status never claims success", status?.textContent?.includes("succeeded") === false);
    check("status glyph is hidden", status?.querySelector("[aria-hidden=true]") !== null);
  } finally {
    view.close();
  }
});

await run("specialized tool receives its interrupted execution state", async () => {
  const view = await mountVueComponent(
    "src/vue/components/CoalescedToolCall.vue",
    {
      toolName: "bash",
      toolInput: { command: "fixture-command" },
      toolResult: "",
      hasResult: false,
      toolInterrupted: true,
    },
    {
      childStubs: {
        "BashTool.vue": `import { h } from "vue"; export default {
        props: ["toolInterrupted"],
        render() { return h("p", { "data-testid": "interrupted-state" },
          this.toolInterrupted ? "interrupted" : "not interrupted"); }
      };`,
      },
    },
  );
  try {
    view.window.dispatchEvent(new view.window.Event("beforeprint"));
    await view.flush();
    check(
      "passes interrupted prop",
      view.container.querySelector("[data-testid=interrupted-state]")?.textContent ===
        "interrupted",
    );
  } finally {
    view.close();
  }
});
