import test from "node:test";
import assert from "node:assert/strict";
import { terminalFont } from "../src/lib/terminalFont.ts";
import { gridColumns } from "../src/lib/gridLayout.ts";
import { appModifier, keyLabel, terminalPasteKey } from "../src/lib/platform.ts";
import { restoreCompanionOpen, saveCompanionOpen } from "../src/lib/companionPreferences.ts";
import { dispatch, attach, detach, clear, sessionExitCode, setExitHandler } from "../src/lib/terminalBus.ts";

test("Mac app commands use Command and leave Control to CLI programs", () => {
  assert.equal(appModifier({ metaKey: true, ctrlKey: false }, true), true);
  assert.equal(appModifier({ metaKey: false, ctrlKey: true }, true), false);
  assert.equal(appModifier({ metaKey: false, ctrlKey: true }, false), true);
  assert.equal(keyLabel("Mod+Shift+1", true), "⌘⇧1");
  assert.equal(keyLabel("Mod+,", true), "⌘,");
  assert.equal(keyLabel("Mod+K", false), "Ctrl K");
});

test("native text and image paste owns Command V but preserves Control V", () => {
  const event = { type: "keydown", code: "KeyV", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  assert.equal(terminalPasteKey({ ...event, metaKey: true }, true), true);
  assert.equal(terminalPasteKey({ ...event, ctrlKey: true }, true), false);
  assert.equal(terminalPasteKey({ ...event, ctrlKey: true, shiftKey: true }, true), true);
  assert.equal(terminalPasteKey({ ...event, metaKey: true, type: "keyup" }, true), false);
  assert.equal(terminalPasteKey({ ...event, metaKey: true }, false), false);
});

test("the tools panel starts closed and remembers an explicit choice", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(restoreCompanionOpen(storage), false);
  saveCompanionOpen(true, storage);
  assert.equal(restoreCompanionOpen(storage), true);
  saveCompanionOpen(false, storage);
  assert.equal(restoreCompanionOpen(storage), false);
  const unavailable = { getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); } };
  assert.equal(restoreCompanionOpen(unavailable), false);
  assert.doesNotThrow(() => saveCompanionOpen(true, unavailable));
});

test("a detached or not-yet-mounted terminal still reports its exit", () => {
  const events = [];
  setExitHandler((id, code) => events.push([id, code]));
  dispatch(321, { type: "exit", code: 1 });
  assert.equal(sessionExitCode(321), 1);
  assert.deepEqual(events, [[321, 1]]);
  const replay = [];
  attach(321, (event) => replay.push(event));
  assert.deepEqual(replay, [{ type: "exit", code: 1 }]);
  assert.equal(events.length, 1, "renderer replay must not duplicate lifecycle events");
  detach(321);
  clear(321);
  assert.equal(sessionExitCode(321), undefined);
  setExitHandler(() => {});
});

test("opening a wide panel stacks terminals instead of squeezing them into unreadable columns", () => {
  assert.equal(gridColumns(2, 1080), 2);
  assert.equal(gridColumns(2, 500), 1);
  assert.equal(gridColumns(6, 800), 2);
  assert.equal(gridColumns(6, 1400), 3);
});

test("choosing Menlo actually changes live and restored terminal fonts", () => {
  assert.equal(terminalFont("Menlo, monospace"), "Menlo, monospace");
  assert.equal(terminalFont('"JetBrains Mono", monospace'), '"JetBrains Mono Variable", monospace');
  assert.equal(terminalFont(""), '"JetBrains Mono Variable", monospace');
});
