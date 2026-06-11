import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appHtml = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const styles = readFileSync(
  new URL("./app.desktop-theme-audit.css", import.meta.url),
  "utf8"
);

test("desktop audit theme loads after all page polish styles", () => {
  const auditIndex = appHtml.indexOf("app.desktop-theme-audit.css");
  assert.ok(auditIndex > appHtml.indexOf("app.chat-polish.css"));
  assert.ok(auditIndex > appHtml.indexOf("app.screenshot-tray.css"));
  assert.ok(auditIndex > appHtml.indexOf("app.profile-voice.css"));
});

test("desktop audit defines missing semantic surface aliases", () => {
  assert.match(styles, /--surface-bg-elevated:\s*var\(--surface-elevated\)/);
  assert.match(styles, /--surface-input:\s*var\(--surface-bg\)/);
});

test("screenshot editor, tray, and notices use semantic theme values", () => {
  for (const selector of [
    ".screenshot-editor",
    ".screenshot-header",
    ".screenshot-stage",
    ".screenshot-tray-item",
    ".screenshot-notice"
  ]) {
    assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(styles, /body\[data-desktop-theme="light"\]/);
  assert.match(styles, /body\[data-desktop-theme="auto"\]/);
  assert.match(styles, /prefers-color-scheme:\s*light/);
  assert.match(styles, /body\.screenshot-editing\s*{\s*overflow:\s*hidden/);
});

test("remaining profile controls use shared surface tokens", () => {
  assert.match(styles, /\.profile-voice-speed-controls button/);
  assert.match(styles, /var\(--surface-border\)/);
  assert.match(styles, /var\(--surface-hover\)/);
});
