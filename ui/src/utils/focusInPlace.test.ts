import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { focusInPlace } from "./focusInPlace";

const { window } = new JSDOM(`<button id="resume">Resume</button><div id="article" role="article">Unread</div>`);
const article = window.document.getElementById("article")!;
window.document.getElementById("resume")!.focus();
focusInPlace(article as unknown as HTMLElement);
assert.equal(window.document.activeElement, article);
assert.equal(article.getAttribute("tabindex"), "-1");

const button = window.document.getElementById("resume")!;
article.blur();
focusInPlace(button as unknown as HTMLElement);
assert.equal(window.document.activeElement, button);
assert.equal(button.hasAttribute("tabindex"), false);

console.log("focusInPlace moves focus to non-focusable reading targets");
