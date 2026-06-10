import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const state = readFileSync(new URL("./app.screenshot-state.js", import.meta.url), "utf8");
const tools = readFileSync(new URL("./app.screenshot-tools.js", import.meta.url), "utf8");
const view = readFileSync(new URL("./app.screenshot-view.js", import.meta.url), "utf8");
const runtime = readFileSync(new URL("./app.screenshot.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./app.screenshot.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const preload = readFileSync(new URL("../electron-preload.cjs", import.meta.url), "utf8");

test("screenshot editor exposes the focused crop and annotation workflow", () => {
  assert.match(view, /Crop/);
  assert.match(view, /Box/);
  assert.match(view, /Pen/);
  assert.match(view, /Apply crop/);
  assert.match(view, /Copy/);
  assert.match(view, /Save/);
  assert.match(tools, /setPointerCapture/);
  assert.match(state, /drawScreenshotCrop/);
  assert.match(state, /slice\(-6\)/);
});

test("screenshot editor is keyboard accessible and renderer isolated", () => {
  assert.match(runtime, /event\.key === "Escape"/);
  assert.match(runtime, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(runtime, /"1": "crop", "2": "box", "3": "pen"/);
  assert.match(view, /role="dialog"/);
  assert.match(view, /aria-modal="true"/);
  assert.match(view, /aria-live="polite"/);
  assert.match(styles, /touch-action: none/);
  assert.match(styles, /\[data-screenshot-apply-crop\]\[hidden\]\s*\{\s*display: none/);
});

test("screenshot editor is wired through a narrow Electron preload API", () => {
  assert.match(preload, /vibyraDesktopScreenshot/);
  assert.match(preload, /screenshot:copy/);
  assert.match(preload, /screenshot:save/);
  assert.match(preload, /screenshot:captured/);
  assert.match(app, /app\.screenshot\.css/);
  assert.match(app, /app\.screenshot-state\.js/);
  assert.match(app, /app\.screenshot\.js/);
});
