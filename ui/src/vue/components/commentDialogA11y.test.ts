import { mountVueComponent } from "../../../scripts/vue-component-test";

const view = await mountVueComponent("src/vue/components/CommentDialog.vue", {
  where: "Line 12, new",
  text: "",
});
try {
  const input = view.container.querySelector<HTMLTextAreaElement>(".diff-viewer-comment-input");
  if (!input) throw new Error("FAIL: CommentDialog renders its comment field");
  if (input.getAttribute("aria-label") !== "Comment text for Line 12, new") {
    throw new Error("FAIL: CommentDialog names its comment field with its target");
  }
  console.log("✓ CommentDialog gives its comment field a target-specific accessible name");
} finally {
  view.close();
}
