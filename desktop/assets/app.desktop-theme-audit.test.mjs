import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appHtml = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const styles = readFileSync(
  new URL("./app.desktop-theme-audit.css", import.meta.url),
  "utf8"
);
const theme = readFileSync(new URL("./app.theme.css", import.meta.url), "utf8");
const shellTheme = readFileSync(new URL("./app.theme-shell.css", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("./app.shell.js", import.meta.url), "utf8");
const chatTheme = readFileSync(new URL("./app.theme-chat.css", import.meta.url), "utf8");
const chatPolish = readFileSync(new URL("./app.chat-polish.css", import.meta.url), "utf8");
const projectsEmpty = readFileSync(new URL("./app.projects-empty.css", import.meta.url), "utf8");

test("desktop audit theme loads after all page polish styles", () => {
  const auditIndex = appHtml.indexOf("app.desktop-theme-audit.css");
  assert.ok(auditIndex > appHtml.indexOf("app.chat-polish.css"));
  assert.ok(auditIndex > appHtml.indexOf("app.screenshot-tray.css"));
  assert.ok(auditIndex > appHtml.indexOf("app.profile-voice.css"));
  assert.ok(auditIndex > appHtml.indexOf("app.projects.css"));
  assert.ok(auditIndex > appHtml.indexOf("app.projects-empty.css"));
  assert.ok(auditIndex > appHtml.indexOf("app.projects-rows.css"));
});

test("desktop audit defines missing semantic surface aliases", () => {
  assert.match(styles, /--surface-bg-elevated:\s*var\(--surface-elevated\)/);
  assert.match(styles, /--surface-input:\s*var\(--surface-bg\)/);
});

test("desktop tabs share the professional graphite palette", () => {
  assert.match(theme, /--color-background:\s*#121214/);
  assert.match(theme, /--color-rail:\s*#17171b/);
  assert.match(theme, /--color-surface:\s*#19191d/);
  assert.match(theme, /--color-elevated:\s*#222226/);
  assert.match(shellTheme, /--shell-rail:\s*var\(--color-rail/);
  assert.match(shellTheme, /box-shadow:\s*inset 2px 0 0 color-mix\(in srgb, var\(--shell-text\)/);
  assert.doesNotMatch(shellTheme, /box-shadow:\s*inset 2px 0 0 color-mix\(in srgb, var\(--shell-accent\)/);
});

test("top chrome and sidebar form one continuous application frame", () => {
  assert.match(shellTheme, /--shell-rail-width:\s*236px/);
  assert.match(shellTheme, /--shell-control-size:\s*34px/);
  assert.match(shellTheme, /--shell-row-height:\s*38px/);
  assert.match(shellTheme, /body\.electron-shell \.desktop-chrome\s*{[\s\S]*background:\s*var\(--shell-rail\)/);
  assert.match(shellTheme, /body\.desktop-authenticated\.electron-shell \.desktop-chrome::before/);
  assert.match(shellTheme, /width:\s*var\(--shell-rail-width\)/);
  assert.match(shellTheme, /body\.electron-shell \.desktop-chrome > \.rail-logo\s*{[\s\S]*position:\s*absolute/);
  assert.match(shellTheme, /body\.desktop-authenticated\.electron-shell \.desktop-chrome-page\s*{[\s\S]*right:\s*176px/);
  assert.match(shellTheme, /\.desktop-chrome-right\s*{[\s\S]*grid-column:\s*2/);
  assert.match(shellTheme, /\.desktop-chrome-right\s*{[\s\S]*pointer-events:\s*none/);
  assert.match(shellTheme, /\.desktop-chrome-actions\s*{[\s\S]*pointer-events:\s*auto/);
  assert.match(shellTheme, /\.desktop-window-controls\s*{[\s\S]*-webkit-app-region:\s*no-drag/);
  assert.match(shellTheme, /\.desktop-window-controls button\s*{[\s\S]*pointer-events:\s*auto/);
  assert.match(shellSource, /if \(chrome && railLogo\) chrome\.prepend\(railLogo\)/);
  assert.match(shellTheme, /body:has\(\.app\.rail-collapsed\)/);
  assert.match(shellTheme, /--shell-rail-width:\s*68px/);
});

test("sidebar chrome uses semantic neutral hierarchy", () => {
  assert.match(shellTheme, /\.rail-logo strong/);
  assert.match(shellTheme, /\.rail-section-head button:hover/);
  assert.match(shellTheme, /\.rail-status-card:hover/);
  assert.match(shellTheme, /\.rail-status\s*{[\s\S]*margin-top:\s*auto/);
  assert.match(shellTheme, /\.rail-status-copy/);
  assert.match(shellTheme, /background:\s*var\(--shell-hover\)/);
  assert.match(shellTheme, /\.rail-status-card\.pending/);
});

test("phone pairing lives only in the bottom rail", () => {
  assert.doesNotMatch(shellSource, /id="open-pair"/);
  assert.match(shellSource, /id="rail-pair"/);
  assert.match(shellSource, /class="rail-phone-icon"/);
});

test("common tab surfaces stay flat and reserve purple for interaction", () => {
  assert.match(styles, /\.composer\s*{/);
  assert.match(styles, /border-radius:\s*10px/);
  assert.match(styles, /\.chat-page--empty \.suggestion:hover/);
  assert.match(styles, /transform:\s*none/);
  assert.match(styles, /\.project-card\.active/);
  assert.match(styles, /border-color:\s*var\(--color-line-accent\)/);
});

test("projects audit owns current semantic project controls", () => {
  for (const selector of [
    ".projects-search",
    ".projects-filter button.active",
    ".project-row.active",
    ".project-chat-button:hover",
    ".projects-empty-action.is-primary:hover"
  ]) {
    assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(styles, /--surface-on-accent:\s*var\(--color-on-accent/);
  assert.match(styles, /color:\s*var\(--surface-on-accent\)/);
  assert.match(styles, /background:\s*var\(--surface-accent-hover\)/);
});

test("chat and projects status colors use semantic tokens", () => {
  assert.match(chatTheme, /--chat-success:\s*var\(--color-success/);
  assert.match(chatTheme, /\.run-card\.is-running\s*{\s*border-color:\s*color-mix\(in srgb, var\(--chat-success\)/);
  assert.match(chatPolish, /\.chat-ai-corner i\s*{[\s\S]*background:\s*var\(--chat-success\)/);
  assert.match(projectsEmpty, /\.projects-empty-action\.is-primary\s*{[\s\S]*color:\s*var\(--surface-on-accent\)/);
  assert.match(projectsEmpty, /\.projects-empty-action\.is-primary:hover\s*{[\s\S]*background:\s*var\(--surface-accent-hover\)/);
  assert.doesNotMatch(chatTheme, /rgba\(22,\s*212,\s*146/);
  assert.doesNotMatch(chatPolish, /#36ce8c/i);
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
