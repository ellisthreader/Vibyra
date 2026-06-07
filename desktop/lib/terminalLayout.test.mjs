import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadLayoutHelpers() {
  const context = {
    terminalGridMeta: () => ({}),
    maxTerminals: 12,
    window: {
      requestAnimationFrame: () => 1,
      addEventListener() {},
      innerWidth: 1280,
    },
    document: {
      addEventListener() {},
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    },
    bindPtyTopbarControls() {},
    refreshPtyTerminalSettingsMenus() {
      return true;
    },
    setTimeout,
  };
  vm.createContext(context);
  vm.runInContext(
    readFileSync(new URL("../assets/app.terminals-layout.js", import.meta.url), "utf8"),
    context,
  );
  return context;
}

function loadToolbarControls() {
  const activations = [];
  const closed = [];
  const listeners = {};
  const context = {
    activePage: "terminals",
    activeTerminalId: "one",
    bindPtyClick() {},
    bindPtyTopbarControls() {},
    closeTerminal: async (id) => closed.push(id),
    createTerminal() {},
    findTerminal(id) {
      return context.terminals.find((terminal) => terminal.id === id);
    },
    maxTerminals: 12,
    newTerminalMenuOpen: false,
    renderTopbar() {
      context.renderCount += 1;
    },
    renderCount: 0,
    requestCloseTerminal(id) {
      closed.push(id);
    },
    setActiveTerminal(id) {
      context.activeTerminalId = id;
      activations.push(id);
    },
    setupProjectId: "",
    terminalAdvancedNewOpen: false,
    terminalAgents: [],
    terminalProjectForSetup: () => "",
    terminalToolbarMenuOpen: false,
    terminals: [
      { id: "one", title: "One" },
      { id: "two", title: "Two" },
    ],
    window: {
      confirm: () => true,
    },
    document: {
      addEventListener(type, listener) {
        listeners[type] = listener;
      },
      getElementById: () => null,
      querySelectorAll: () => [],
    },
  };
  vm.createContext(context);
  vm.runInContext(
    readFileSync(new URL("../assets/app.terminals-simple-controls.js", import.meta.url), "utf8"),
    context,
  );
  return { context, activations, closed, listeners };
}

test("terminal grid uses balanced layouts for common multi-terminal counts", () => {
  const { bestTerminalGrid } = loadLayoutHelpers();
  assert.deepEqual(
    [2, 4, 6, 8, 12].map((count) => {
      const layout = bestTerminalGrid(count, 900, 620);
      return [layout.cols, layout.rows];
    }),
    [[2, 1], [2, 2], [3, 2], [3, 3], [4, 3]],
  );
});

test("terminal grid keeps usable cells in narrow windows", () => {
  const { bestTerminalGrid } = loadLayoutHelpers();
  const layout = bestTerminalGrid(4, 480, 620);
  assert.equal(layout.cols, 2);
  assert.equal(layout.rows, 2);
  assert.equal(layout.scroll, false);
});

test("terminal grid enables scrolling when no readable row height fits", () => {
  const { bestTerminalGrid } = loadLayoutHelpers();
  const layout = bestTerminalGrid(12, 600, 300);
  assert.equal(layout.scroll, true);
  assert.ok(layout.minRow >= 170);
});

test("terminal grid rejects zero-size measurements", () => {
  const { bestTerminalGrid, measuredTerminalStageSize } = loadLayoutHelpers();
  assert.equal(measuredTerminalStageSize({ width: 0, height: 620 }), null);
  assert.equal(bestTerminalGrid(4, 0, 620).valid, false);
});

test("terminal grid respects responsive column limits", () => {
  const { bestTerminalGrid } = loadLayoutHelpers();
  assert.deepEqual(
    [1, 2].map((maxColumns) => {
      const layout = bestTerminalGrid(6, 900, 620, maxColumns);
      return [layout.cols, layout.rows];
    }),
    [[1, 6], [2, 3]],
  );
});

test("active terminal tab scroll is relative to the tab viewport", () => {
  const { terminalTabScrollTarget } = loadLayoutHelpers();
  const list = { left: 100, right: 400 };
  assert.equal(terminalTabScrollTarget(list, { left: 80, right: 150 }, 40), 14);
  assert.equal(terminalTabScrollTarget(list, { left: 350, right: 430 }, 40), 76);
  assert.equal(terminalTabScrollTarget(list, { left: 150, right: 350 }, 40), 40);
});

test("terminal fitting excludes hidden and zero-size nodes", () => {
  const { terminalNodeCanFit } = loadLayoutHelpers();
  const node = (rect, hidden = false) => ({
    isConnected: true,
    closest: () => hidden ? {} : null,
    getBoundingClientRect: () => rect,
  });
  assert.equal(terminalNodeCanFit(node({ width: 400, height: 240 })), true);
  assert.equal(terminalNodeCanFit(node({ width: 0, height: 240 })), false);
  assert.equal(terminalNodeCanFit(node({ width: 400, height: 240 }, true)), false);
});

test("responsive grid sync is idempotent for an unchanged stage", () => {
  const context = loadLayoutHelpers();
  const properties = new Map();
  const classes = new Set(["grid-mode"]);
  let writes = 0;
  const stage = {
    getBoundingClientRect: () => ({ width: 600, height: 300 }),
    querySelectorAll: () => Array.from({ length: 12 }),
  };
  const page = {
    classList: {
      contains: (name) => classes.has(name),
      toggle(name, active) {
        if (active) classes.add(name);
        else classes.delete(name);
      },
    },
    querySelector: () => stage,
    style: {
      getPropertyValue: (name) => properties.get(name) || "",
      setProperty(name, value) {
        writes += 1;
        properties.set(name, String(value));
      },
    },
  };
  context.document.querySelector = () => page;
  assert.equal(context.syncResponsiveTerminalGrid(), true);
  assert.equal(context.syncResponsiveTerminalGrid(), false);
  assert.equal(writes, 5);
  assert.equal(classes.has("terminal-grid-scroll"), true);
});

test("terminal shortcuts create, close, and switch without window controls", () => {
  const { context, activations, closed, listeners } = loadToolbarControls();
  const event = (key, extra = {}) => ({ key, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, preventDefault() {}, ...extra });

  listeners.keydown(event("Tab"));
  assert.equal(context.activeTerminalId, "two");
  assert.deepEqual(activations, ["two"]);

  listeners.keydown(event("Tab", { shiftKey: true }));
  assert.equal(context.activeTerminalId, "one");
  assert.deepEqual(activations, ["two", "one"]);

  listeners.keydown(event("t"));
  assert.equal(context.newTerminalMenuOpen, true);
  assert.equal(context.renderCount, 1);

  listeners.keydown(event("w"));
  assert.deepEqual(closed, ["one"]);
});
