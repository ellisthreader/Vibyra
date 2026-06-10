import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const windowSource = readFileSync(new URL("./app.terminals-window.js", import.meta.url), "utf8");
const ptySource = readFileSync(new URL("./app.terminals-pty.js", import.meta.url), "utf8");
const controlsSource = readFileSync(new URL("./app.terminals-controls.js", import.meta.url), "utf8");
const renderSource = readFileSync(new URL("./app.terminals-render.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./app.terminals-window.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../lib/ptyTerminals.mjs", import.meta.url), "utf8");

test("new terminals receive unused common names", () => {
  const context = terminalWindowContext([{ title: "Alex" }]);
  assert.equal(context.__terminalWindow.terminalRandomName(), "Avery");
  assert.match(ptySource, /title: typeof terminalRandomName === "function" \? terminalRandomName\(\)/);
});

test("each terminal header exposes full screen, details, and close", () => {
  const context = terminalWindowContext([]);
  const markup = context.__terminalWindow.terminalWindowActions({ id: "term-1", title: "Jordan" });
  assert.match(markup, /data-terminal-fullscreen="term-1"/);
  assert.match(markup, /data-terminal-settings="term-1"/);
  assert.match(markup, /data-terminal-close="term-1"/);
  assert.match(styles, /\.terminal-page--terminal-fullscreen \.terminal-stage/);
  assert.match(styles, /\.terminal-fullscreen-hidden/);
  assert.match(controlsSource, /bindTerminalFullscreenControls/);
});

test("the selected terminal has a clear provider-colored edge", () => {
  assert.match(styles, /\.terminal-focus\.active::after,\s*\n\.terminal-tile\.active::after/);
  assert.match(styles, /border: 1px solid var\(--terminal-accent/);
  assert.match(styles, /box-shadow: inset 0 0 0 1px var\(--terminal-accent-border/);
  assert.match(styles, /\.terminal-focus\.active \.terminal-focus-head/);
  assert.match(styles, /color: var\(--terminal-accent/);
});

test("terminal window helpers load before terminal creation", () => {
  const stateIndex = html.indexOf("app.terminals-state.js");
  const windowIndex = html.indexOf("app.terminals-window.js");
  const storeIndex = html.indexOf("app.terminals-store.js");
  assert.ok(stateIndex >= 0 && stateIndex < windowIndex);
  assert.ok(windowIndex < storeIndex);
});

test("terminal workspace keeps one dock while project groups live in the left rail", () => {
  assert.match(html, /app\.terminals-project-groups/);
  assert.doesNotMatch(renderSource, /terminalProjectTabs/);
  assert.match(renderSource, /grid \? terminals\.map\(terminalTile\)/);
  assert.match(ptySource, /const tabs = projectTerminals\.map/);
});

test("safe mode remains recommended and routed Auto sessions preserve friendly names", () => {
  assert.match(ptySource, /"Safe mode", "Each terminal gets separate files to prevent overlap", true/);
  assert.match(backendSource, /if \(requested && !\/\^\(\?:auto\|terminal\)/);
});

function terminalWindowContext(terminals) {
  const storage = new Map();
  const context = {
    Math: Object.create(Math),
    terminals,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      removeItem: (key) => storage.delete(key),
      setItem: (key, value) => storage.set(key, String(value))
    },
    document: { addEventListener() {} },
    escapeAttribute: String,
    icon: (name) => `<${name}>`,
    findTerminal: (id) => terminals.find((terminal) => terminal.id === id),
    render() {},
    saveTerminals() {},
    activeTerminalId: "",
    settingsTerminalId: "",
    forceTerminalRender: false
  };
  context.Math.random = () => 0;
  vm.runInNewContext(
    `${windowSource}\nglobalThis.__terminalWindow = { terminalRandomName, terminalWindowActions };`,
    context
  );
  return context;
}
