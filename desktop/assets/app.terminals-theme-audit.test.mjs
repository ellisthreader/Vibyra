import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appHtml = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const styles = readFileSync(
  new URL("./app.terminals-theme-audit.css", import.meta.url),
  "utf8"
);
const workspaceStyles = readFileSync(
  new URL("./app.terminals-workspace-theme-audit.css", import.meta.url),
  "utf8"
);
const themeStyles = readFileSync(
  new URL("./app.theme-terminals.css", import.meta.url),
  "utf8"
);
const controlStyles = readFileSync(
  new URL("./app.theme-terminals-controls.css", import.meta.url),
  "utf8"
);
const stateStyles = readFileSync(
  new URL("./app.theme-terminals-states.css", import.meta.url),
  "utf8"
);
const ptyRuntime = readFileSync(
  new URL("./app.terminals-pty-runtime.js", import.meta.url),
  "utf8"
);

test("terminal audit theme layer loads after all terminal feature styles", () => {
  const auditIndex = appHtml.indexOf("app.terminals-theme-audit.css");
  const workspaceAuditIndex = appHtml.indexOf("app.terminals-workspace-theme-audit.css");
  assert.ok(auditIndex > appHtml.indexOf("app.terminals-auto-polish.css"));
  assert.ok(workspaceAuditIndex > auditIndex);
  assert.ok(auditIndex > appHtml.indexOf("app.terminals-memory-fullscreen-content.css"));
  assert.ok(auditIndex > appHtml.indexOf("app.terminals-test-loading.css"));
  assert.ok(auditIndex > appHtml.indexOf("app.terminals-editor.css"));
});

test("terminal audit theme owns formerly dark-only surfaces", () => {
  for (const selector of [
    ".terminal-stage",
    ".terminal-focus",
    ".terminal-xterm .xterm-viewport",
    ".terminal-model-picker",
    ".terminal-companion",
    ".terminal-test-canvas",
    ".terminal-setup-grid-preview",
    ".terminal-agent-row button"
  ]) {
    assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const selector of [
    ".terminal-companion--editor",
    ".terminal-editor-explorer",
    ".terminal-editor-explorer > header span",
    ".terminal-memory-workspace--fullscreen",
    ".terminal-memory-appbar",
    ".terminal-test-runner",
    ".terminal-test-runner-feed"
  ]) {
    assert.match(workspaceStyles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const combined = `${styles}\n${workspaceStyles}`;
  assert.match(combined, /var\(--terminal-bg\)/);
  assert.match(combined, /var\(--terminal-surface\)/);
  assert.match(combined, /var\(--terminal-text\)/);
  assert.match(combined, /var\(--terminal-border/);
});

test("terminal semantic foundations inherit the shared graphite system", () => {
  assert.match(themeStyles, /--terminal-bg:\s*var\(--color-background,\s*#121214\)/);
  assert.match(themeStyles, /--terminal-rail:\s*var\(--color-rail,\s*#17171b\)/);
  assert.match(themeStyles, /--terminal-surface:\s*var\(--color-surface,\s*#19191d\)/);
  assert.match(themeStyles, /--terminal-elevated:\s*var\(--color-elevated,\s*#222226\)/);
  assert.match(controlStyles, /--terminal-companion-bg:\s*var\(--terminal-surface\)/);
  assert.match(controlStyles, /--terminal-workspace-chrome:\s*var\(--terminal-rail\)/);
  assert.match(controlStyles, /--terminal-editor-canvas:\s*var\(--terminal-bg\)/);
  assert.match(stateStyles, /--terminal-bg:\s*var\(--color-background\)/);
  assert.match(stateStyles, /--terminal-surface:\s*var\(--color-surface\)/);
  assert.match(stateStyles, /--terminal-elevated:\s*var\(--color-elevated\)/);
});

test("xterm selection and auto appearance use live semantic theme values", () => {
  assert.match(ptyRuntime, /css\("--terminal-selection"/);
  assert.match(ptyRuntime, /css\("--terminal-selection-inactive"/);
  assert.match(ptyRuntime, /matchMedia\("\(prefers-color-scheme: light\)"\)/);
  assert.match(ptyRuntime, /addEventListener\?\.\("change", scheduleTheme\)/);
});
