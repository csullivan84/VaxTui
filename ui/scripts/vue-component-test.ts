import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import vuePlugin from "esbuild-plugin-vue3";
import { JSDOM } from "jsdom";
import type { Component, App, Plugin } from "vue";

interface ComponentTestOptions {
  childStubs?: Record<string, string>;
  /** Exact external module specifiers replaced only for this component test. */
  moduleStubs?: Record<string, string>;
  configure?: (app: App, bindings: Record<string, unknown>, vue: typeof import("vue")) => void;
}

let sharedDOM: JSDOM | null = null;

function testEnvironment() {
  if (sharedDOM) return sharedDOM;
  sharedDOM = new JSDOM("<body></body>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  for (const name of [
    "window",
    "document",
    "navigator",
    "Node",
    "Element",
    "HTMLElement",
    "HTMLButtonElement",
    "SVGElement",
    "Event",
    "CustomEvent",
    "MouseEvent",
    "KeyboardEvent",
    "FocusEvent",
    "MutationObserver",
    "localStorage",
    "sessionStorage",
  ]) {
    const value = name === "window" ? sharedDOM.window : Reflect.get(sharedDOM.window, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  if (!sharedDOM.window.matchMedia) {
    sharedDOM.window.matchMedia = () =>
      ({
        matches: false,
        media: "",
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  return sharedDOM;
}

/** Compile and mount the real SFC with explicit child/service test adapters. */
export async function mountVueComponent(
  relativePath: string,
  initialProps: Record<string, unknown>,
  options: ComponentTestOptions = {},
) {
  const dom = testEnvironment();
  const filename = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  const i18nPath = fileURLToPath(new URL("../src/vue/composables/i18n.ts", import.meta.url));
  const refusalKeyPath = fileURLToPath(
    new URL("../src/vue/components/refusalContinue.ts", import.meta.url),
  );
  await readFile(filename); // Missing test targets must fail, never mount a fallback.
  const result = await build({
    stdin: {
      contents: `export { default } from ${JSON.stringify(filename)}; export { i18nPlugin } from ${JSON.stringify(i18nPath)}; export { RefusalContinueKey } from ${JSON.stringify(refusalKeyPath)};`,
      resolveDir: fileURLToPath(new URL("..", import.meta.url)),
      loader: "ts",
    },
    bundle: true,
    write: false,
    outfile: "/tmp/shelley-vue-component-test.cjs",
    platform: "node",
    format: "cjs",
    external: ["vue"],
    plugins: [
      {
        name: "unit-child-boundaries",
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) =>
            options.moduleStubs?.[args.path]
              ? { path: args.path, namespace: "component-module-stub" }
              : undefined,
          );
          builder.onLoad({ filter: /.*/, namespace: "component-module-stub" }, (args) => ({
            contents: options.moduleStubs?.[args.path] ?? "",
            loader: "js",
          }));
          builder.onResolve({ filter: /\.vue$/ }, (args) =>
            args.path === filename ? undefined : { path: args.path, namespace: "child-stub" },
          );
          builder.onLoad({ filter: /.*/, namespace: "child-stub" }, (args) => ({
            contents:
              options.childStubs?.[args.path.split("/").at(-1)!] ??
              "export default { render() { return null; } };",
          }));
        },
      },
      vuePlugin(),
    ],
  });
  const require = createRequire(new URL("../package.json", import.meta.url));
  const compiled = { exports: {} as { default: Component; i18nPlugin: Plugin } };
  const javascript = result.outputFiles.find((file) => file.path.endsWith(".cjs"));
  if (!javascript) throw new Error("Component compiler did not produce JavaScript");
  new Function("require", "module", "exports", javascript.text)(
    require,
    compiled,
    compiled.exports,
  );
  const vue = require("vue") as typeof import("vue");
  const props = vue.reactive({ ...initialProps });
  let app: App;
  let container: HTMLElement;
  const mount = () => {
    container = dom.window.document.createElement("main");
    dom.window.document.body.append(container);
    app = vue.createApp({ render: () => vue.h(compiled.exports.default, props) });
    app.use(compiled.exports.i18nPlugin);
    options.configure?.(app, compiled.exports, vue);
    app.directive("tooltip", {});
    app.mount(container);
  };
  mount();
  const flush = async () => {
    await vue.nextTick();
    await Promise.resolve();
    await vue.nextTick();
  };
  await flush();
  return {
    container,
    props,
    document: dom.window.document,
    window: dom.window,
    flush,
    async remount() {
      app.unmount();
      container.remove();
      mount();
      await flush();
      return container;
    },
    close() {
      app.unmount();
      container.remove();
      dom.window.localStorage.clear();
      dom.window.sessionStorage.clear();
    },
  };
}
