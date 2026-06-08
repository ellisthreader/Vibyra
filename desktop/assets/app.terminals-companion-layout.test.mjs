import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./app.terminals-companion-layout.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./app.terminals-companion-layout.css", import.meta.url), "utf8");

function layoutContext(storedWidth = "") {
  const values = new Map(storedWidth ? [["vibyra.desktop.terminalCompanionWidth", storedWidth]] : []);
  const window = {
    addEventListener() {},
    requestAnimationFrame(callback) {
      callback();
      return 1;
    }
  };
  const context = vm.createContext({
    console,
    document: { querySelector() { return null; }, body: { classList: { toggle() {} } } },
    icon() { return "<svg></svg>"; },
    localStorage: {
      getItem(key) { return values.get(key) || null; },
      setItem(key, value) { values.set(key, value); }
    },
    setTimeout,
    window,
    closeTerminalCompanionPanel() {}
  });
  vm.runInContext(source, context);
  return context;
}

test("companion width preserves a readable terminal area", () => {
  const context = layoutContext();
  const bounds = vm.runInContext("terminalCompanionWidthBounds(1200)", context);
  assert.equal(bounds.minimum, 280);
  assert.equal(bounds.maximum, 720);
  assert.equal(vm.runInContext("clampTerminalCompanionWidth(900, 1000)", context), 580);
  assert.equal(vm.runInContext("clampTerminalCompanionWidth(100, 1000)", context), 280);
});

test("stored width is clamped against the current page", () => {
  const context = layoutContext("690");
  assert.equal(vm.runInContext("clampTerminalCompanionWidth(terminalCompanionWidth, 900)", context), 480);
});

test("fullscreen is Memory-only and restores terminal fitting", () => {
  const context = layoutContext();
  assert.match(source, /terminalMemoryFullscreen && Boolean\(page\.querySelector\("\[data-terminal-memory-workspace\]"\)\)/);
  assert.match(source, /node\.type === "folder" && !node\.parentId/);
  assert.match(source, /terminalMemoryState\.expandedIds\.add\(node\.id\)/);
  assert.match(source, /if \(!terminalMemoryFullscreen\) scheduleTerminalCompanionResizeFit\(\)/);
  assert.match(styles, /terminal-page--memory-fullscreen:has\(\.terminal-memory-workspace\)/);
  assert.match(styles, /terminal-page--memory-fullscreen \.terminal-stage/);
  assert.match(styles, /terminal-page--memory-fullscreen \.terminal-companion-primary/);
  assert.match(styles, /terminal-page--memory-fullscreen \.terminal-memory-workbench/);
  assert.equal(vm.runInContext("terminalMemoryIsFullscreen()", context), false);
});

test("splitter supports pointer and keyboard resizing", () => {
  assert.match(source, /setPointerCapture/);
  assert.match(source, /"ArrowLeft", "ArrowRight", "Home", "End"/);
  assert.match(source, /localStorage\.setItem\(terminalCompanionWidthKey/);
  assert.match(styles, /cursor: col-resize/);
  assert.match(styles, /focus-visible/);
});
