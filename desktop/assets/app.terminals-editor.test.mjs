import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./app.terminals-editor-runtime.js", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("./app.terminals-editor-state.js", import.meta.url), "utf8");
const monacoSource = readFileSync(new URL("./app.terminals-editor-monaco.js", import.meta.url), "utf8");
const viewSource = readFileSync(new URL("./app.terminals-editor-view.js", import.meta.url), "utf8");
const appHtml = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const companionSource = readFileSync(new URL("./app.terminals-companion.js", import.meta.url), "utf8");
const ptySource = readFileSync(new URL("./app.terminals-pty-runtime.js", import.meta.url), "utf8");

function editorContext() {
  const opened = [];
  const context = vm.createContext({
    window: { setInterval() {} },
    terminalCompanionMode: "editor",
    activeTerminalId: "terminal-1",
    findTerminal: () => ({ id: "terminal-1" }),
    loadTerminalEditorWorkspace: async () => null,
    loadTerminalEditorFile: async (...args) => opened.push(args),
    refreshTerminalEditor() {},
    normalizeTerminalEditorPath: (value) => String(value).replace(/^@/, ""),
    document: { querySelector: () => null },
    syncTerminalCompanion() {},
    activeTerminalEditorTab: () => null,
    terminalEditorApi: () => "",
    terminalEditorDirty: () => false,
    terminalEditorChangedLines: () => new Set(),
    terminalEditorGutterHtml: () => "",
    saveTerminalEditorTab() {},
    revertTerminalEditorTab() {},
    closeTerminalEditorTab() {},
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => callback(),
    Event
  });
  vm.runInContext(source, context);
  return { context, opened };
}

test("terminal editor recognizes relative and absolute source links with positions", () => {
  const { context } = editorContext();
  const links = vm.runInContext(
    "terminalEditorLinksForLine('Edited src/App.tsx:42:7 and /tmp/project/server.js:9', 3, 'terminal-1')",
    context
  );

  assert.equal(links.length, 2);
  assert.equal(links[0].text, "src/App.tsx");
  assert.deepEqual({ ...links[0].range.start }, { x: 8, y: 3 });
  assert.equal(links[1].text, "/tmp/project/server.js");
});

test("terminal editor link activation keeps the captured line and column", async () => {
  const { context, opened } = editorContext();
  vm.runInContext(
    "terminalEditorLinksForLine('src/App.tsx:42:7 other.js:5:2', 1, 'terminal-1').forEach((link) => link.activate())",
    context
  );
  await Promise.resolve();

  assert.deepEqual(opened, [
    ["terminal-1", "src/App.tsx", 42, 7],
    ["terminal-1", "other.js", 5, 2]
  ]);
});

test("terminal editor loads before the companion and attaches through xterm links", () => {
  assert.ok(appHtml.indexOf("app.terminals-editor-runtime.js") < appHtml.indexOf("app.terminals-companion.js"));
  assert.ok(appHtml.indexOf("/desktop/vendor/monaco/vs/loader.js") < appHtml.indexOf("app.terminals-editor-monaco.js"));
  assert.ok(appHtml.indexOf("app.terminals-editor-monaco.js") < appHtml.indexOf("app.terminals-editor-runtime.js"));
  assert.match(companionSource, /terminalCompanionModes = new Set\(\["editor"/);
  assert.match(companionSource, /terminalEditorHtml\(displayTerminal\)/);
  assert.match(companionSource, /openTerminalEditorWorkspace\(terminalCompanionActiveTerminal\(\)\?\.id/);
  assert.match(companionSource, /terminalEditorPrepareRemount/);
  assert.match(ptySource, /attachTerminalEditorLinkProvider\(id, xterm\)/);
  assert.match(source, /workspaceTerminalId = activeTerminalId/);
  assert.match(stateSource, /terminalEditorWorkspaceRequests/);
});

test("terminal editor uses Monaco with VS Code editing features", () => {
  assert.match(viewSource, /class="terminal-editor-monaco"/);
  assert.doesNotMatch(viewSource, /<textarea/);
  assert.match(monacoSource, /defineTheme\("vibyra-dark-plus"/);
  assert.match(monacoSource, /defineTheme\("vibyra-light-plus"/);
  assert.match(monacoSource, /theme: terminalEditorEffectiveTheme\(\)/);
  assert.match(monacoSource, /prefers-color-scheme: light/);
  assert.match(monacoSource, /data-desktop-theme/);
  assert.match(monacoSource, /minimap: \{ enabled: true/);
  assert.match(monacoSource, /bracketPairColorization: \{ enabled: true/);
  assert.match(monacoSource, /stickyScroll: \{ enabled: true/);
  assert.match(monacoSource, /CtrlCmd \| monaco\.KeyCode\.KeyS/);
  assert.match(monacoSource, /tsx: "typescript"/);
  assert.match(monacoSource, /py: "python"/);
});

test("terminal editor starts with collapsed folders and uses the normal companion width", () => {
  const styles = readFileSync(new URL("./app.terminals-editor.css", import.meta.url), "utf8");
  assert.match(viewSource, /<details class="terminal-editor-folder">/);
  assert.doesNotMatch(viewSource, /<details class="terminal-editor-folder" open>/);
  assert.doesNotMatch(styles, /minmax\(620px, 58%\)/);
  assert.doesNotMatch(styles, /minmax\(560px, 64%\)/);
});

test("terminal editor sidebar shows only the project directory context", () => {
  assert.match(viewSource, /class="terminal-editor-directory"/);
  assert.match(viewSource, /workspace\?\.root \|\| "Project files"/);
  assert.doesNotMatch(viewSource, /title="Refresh files"/);
  assert.doesNotMatch(viewSource, /<strong>Explorer<\/strong>/);
  assert.doesNotMatch(viewSource, /workspace\?\.title \|\| terminal\?\.title/);
  assert.doesNotMatch(viewSource, /terminal-editor-workspace-name/);
});
