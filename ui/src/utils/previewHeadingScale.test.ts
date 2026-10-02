import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// Render the real production CSS, not a source-string check or copied styles.
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(
    '<article class="file-preview-document"><div class="markdown-content">' +
      "<h1>Release</h1><h2>Features</h2><h3>Details</h3><p>Body</p>" +
      "</div></article>",
  );
  await page.addStyleTag({ path: fileURLToPath(new URL("../styles.css", import.meta.url)) });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const sizes = await page.evaluate(() =>
      ["h1", "h2", "h3"].map((tag) =>
        Number.parseFloat(getComputedStyle(document.querySelector(tag)!).fontSize),
      ),
    );
    assert.ok(sizes[0] > sizes[1], `width ${width}: h1 ${sizes[0]} must exceed h2 ${sizes[1]}`);
    assert.ok(sizes[1] > sizes[2], `width ${width}: h2 ${sizes[1]} must exceed h3 ${sizes[2]}`);
  }
} finally {
  await browser.close();
}
console.log("Production preview heading hierarchy passed at desktop and mobile widths");
