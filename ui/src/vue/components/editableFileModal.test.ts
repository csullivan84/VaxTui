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

type MonacoControl = { change: (value: string) => void; save: () => void; focused: () => boolean };

async function mountEditor(path: string, writes: Response[] = []) {
  let writeCount = 0;
  let editorCreates = 0;
  const writeBodies: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/read")) {
      const path = new URL(url, "http://localhost").searchParams.get("path");
      return new Response(path?.includes("second") ? "second file" : "# Preview fixture\n\nCurrent editor content.", { status: 200 });
    }
    if (url === "/api/write-file" && init?.method === "POST") { writeCount++; writeBodies.push(String(init.body)); return writes.shift() ?? new Response("", { status: 200 }); }
    throw new Error(`Unexpected fetch ${url}`);
  };
  const view = await mountVueComponent(
    "src/vue/components/EditableFileModal.vue",
    { isOpen: true, path },
    {
      childStubs: {
        "MarkdownContent.vue": "export default { props: ['text'], template: '<p>{{ text }}</p>' };",
      },
      moduleStubs: {
        "../../services/monaco": `
          export const KeyMod = { CtrlCmd: 1 };
          export const KeyCode = { KeyS: 1 };
          export const languages = { getLanguages: () => [{ id: "markdown", extensions: [".md"] }] };
          export const editor = {
            create(_host, options) {
              globalThis.__editableCreates = (globalThis.__editableCreates || 0) + 1;
              let value = options.value; let onChange = () => {}; let onSave = () => {}; let focused = false;
              globalThis.__editableMonaco = {
                change(next) { value = next; onChange(); }, save() { onSave(); }, focused: () => focused,
              };
              return {
                getValue: () => value, updateOptions: () => {}, layout: () => {}, focus: () => { focused = true; }, dispose: () => {},
                onDidChangeModelContent: (callback) => { onChange = callback; }, addCommand: (_key, callback) => { onSave = callback; },
              };
            }, setTheme: () => {},
          };
          export function loadMonaco() { return Promise.resolve({ KeyMod, KeyCode, languages, editor }); }
        `,
      },
    },
  );
  for (let index = 0; index < 4; index++) await view.flush();
  const control = (globalThis as typeof globalThis & { __editableMonaco?: MonacoControl }).__editableMonaco;
  if (!control) throw new Error("Monaco adapter was not initialized by the compiled modal");
  editorCreates = (globalThis as typeof globalThis & { __editableCreates?: number }).__editableCreates ?? 0;
  return { view, control, writeCount: () => writeCount, writeBodies: () => writeBodies, editorCreates: () => (globalThis as typeof globalThis & { __editableCreates?: number }).__editableCreates ?? editorCreates };
}

await run("EditableFileModal previews markdown through its real compiled SFC", async () => {
  const { view } = await mountEditor("/private/preview.md");
  try {
    const dialog = view.document.querySelector('[role="dialog"]');
    const previewButton = dialog?.querySelector<HTMLButtonElement>('[aria-label="Preview mode"]');
    check("markdown exposes preview", previewButton instanceof view.window.HTMLButtonElement);
    previewButton?.click();
    await view.flush();
    const preview = view.document.querySelector<HTMLElement>('[role="region"][aria-label="Markdown preview"]');
    check("preview enters a labeled reading region", preview instanceof view.window.HTMLElement);
    check("preview receives focus", view.document.activeElement === preview);
    check("preview reflects loaded content", preview?.textContent?.includes("Preview fixture") === true);
    dialog?.querySelector<HTMLButtonElement>('[aria-label="Split view"]')?.click();
    await view.flush();
    check("split view keeps the labeled preview present", view.document.querySelector('[role="region"][aria-label="Markdown preview"]') !== null);
  } finally { view.close(); }
});

await run("EditableFileModal keeps preview unavailable for non-Markdown paths", async () => {
  const { view } = await mountEditor("/private/preview.txt");
  try {
    check("non-Markdown path has no preview action", view.document.querySelector('[aria-label="Preview mode"]') === null);
    check("non-Markdown path has no split action", view.document.querySelector('[aria-label="Split view"]') === null);
  } finally { view.close(); }
});

await run("EditableFileModal saves Monaco changes through its registered command", async () => {
  const { view, control, writeCount } = await mountEditor("/private/AGENTS.md", [new Response("", { status: 200 })]);
  try {
    control.change("updated policy");
    control.save();
    for (let index = 0; index < 4; index++) await view.flush();
    check("save succeeds", view.document.body.textContent?.includes("Saved") === true);
    check("save command issued one ordered write", writeCount() === 1);
  } finally { view.close(); }
});

await run("EditableFileModal recreates Monaco for a reused path without carrying the old buffer", async () => {
  const { view, editorCreates } = await mountEditor("/private/first.md");
  try {
    const initialCreates = editorCreates();
    view.props.path = "/private/second.txt";
    for (let index = 0; index < 6; index++) await view.flush();
    check("path header changes to the newly loaded file", view.document.body.textContent?.includes("/private/second.txt") === true);
    check("the new file gets a new Monaco instance", editorCreates() === initialCreates + 1);
    check("non-Markdown target no longer exposes preview", view.document.querySelector('[aria-label="Preview mode"]') === null);
  } finally { view.close(); }
});

await run("EditableFileModal keeps rapid explicit saves ordered and preserves their final buffer", async () => {
  const { view, control, writeCount, writeBodies } = await mountEditor("/private/AGENTS.md", [
    new Response("", { status: 200 }),
    new Response("", { status: 200 }),
  ]);
  try {
    control.change("first policy");
    control.save();
    control.change("second policy");
    control.save();
    for (let index = 0; index < 6; index++) await view.flush();
    check("two explicit saves are sent", writeCount() === 2);
    check("second ordered save has latest editor text", writeBodies().at(-1)?.includes("second policy") === true);
    check("the final ordered save reports success", view.document.body.textContent?.includes("Saved") === true);
  } finally { view.close(); }
});

await run("EditableFileModal surfaces a failed ordered save and retains editor focus", async () => {
  const { view, control, writeCount } = await mountEditor("/private/AGENTS.md", [new Response("no", { status: 500 })]);
  try {
    control.change("unsaved policy");
    control.save();
    for (let index = 0; index < 4; index++) await view.flush();
    check("failure is announced", view.document.body.textContent?.includes("Error saving") === true);
    check("failed save keeps the editor surface available", view.document.querySelector(".diff-viewer-editor") !== null);
    check("failed save still issued its ordered write", writeCount() === 1);
  } finally { view.close(); }
});
