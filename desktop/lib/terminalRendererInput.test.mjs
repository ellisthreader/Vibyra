import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadTerminalInputBinding({ xtermAvailable }) {
  const source = readFileSync(
    new URL("../assets/app.terminals-pty.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("const previousBindTerminalControls = bindTerminalControls;");
  const end = source.indexOf("\n};", start) + 3;
  assert.ok(start >= 0 && end > start, "terminal input binding must be discoverable");

  const listeners = new Map();
  const input = {
    dataset: { terminalInput: "terminal-1" },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
  };
  const calls = { fallbackKeys: 0, fallbackPaste: 0, focus: 0, mounted: 0 };
  const context = {
    bindTerminalControls() {},
    createTerminal() {},
    document: {
      querySelectorAll(selector) {
        return selector === "[data-terminal-input]" ? [input] : [];
      },
    },
    focusPtyTerminal() {
      calls.focus += 1;
    },
    handlePtyKeydown() {
      calls.fallbackKeys += 1;
    },
    mountVisibleXterms() {
      calls.mounted += 1;
    },
    normalizeTerminalAgent(value) {
      return value;
    },
    render() {},
    sendPtyInput() {
      calls.fallbackPaste += 1;
    },
    setupAgent: "vibyra",
    window: {
      Terminal: xtermAvailable ? function Terminal() {} : undefined,
    },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  context.bindTerminalControls();
  return { calls, input, listeners };
}

test("xterm owns keyboard and paste input while wrapper keeps focus handlers", () => {
  const { calls, listeners } = loadTerminalInputBinding({ xtermAvailable: true });

  assert.equal(listeners.has("keydown"), false);
  assert.equal(listeners.has("paste"), false);
  listeners.get("pointerdown")();
  listeners.get("click")();
  assert.equal(calls.focus, 2);
  assert.equal(calls.mounted, 1);
});

test("terminal wrapper binds keyboard and paste fallback without xterm", () => {
  const { calls, listeners } = loadTerminalInputBinding({ xtermAvailable: false });
  let prevented = false;

  listeners.get("keydown")({});
  listeners.get("paste")({
    preventDefault() {
      prevented = true;
    },
    clipboardData: { getData: () => "pasted" },
  });

  assert.equal(calls.fallbackKeys, 1);
  assert.equal(calls.fallbackPaste, 1);
  assert.equal(prevented, true);
  assert.equal(listeners.has("pointerdown"), true);
  assert.equal(listeners.has("click"), true);
});

test("model-picked terminals use Vibyra while explicit agents are preserved", () => {
  const source = readFileSync(
    new URL("../assets/app.terminals-pty.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /const agent = options\.agent \? normalizeTerminalAgent\(options\.agent\) : "vibyra";/);
  assert.match(source, /if \(provider === "openai"\) return "codex";/);
});
