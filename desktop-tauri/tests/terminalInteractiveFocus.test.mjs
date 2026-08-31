import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  focusMountedTerminal,
  restoreTerminalFocusAfterOverlay,
} from "../src/lib/terminalFocus.ts";

const read = (path) => readFile(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

function focusHost({ connected = true, inert = false } = {}) {
  return {
    isConnected: connected,
    closest: (selector) => selector === "[inert]" && inert ? {} : null,
  };
}

test("a focused pane hands keyboard focus to xterm after its delayed mount", () => {
  let calls = 0;
  const focused = focusMountedTerminal({
    id: 7,
    focusedId: 7,
    active: true,
    host: focusHost(),
    modalOpen: false,
    focus: () => { calls += 1; },
  });

  assert.equal(focused, true);
  assert.equal(calls, 1);
});

test("a late terminal mount never steals focus", () => {
  const blocked = [
    { focusedId: 8 },
    { active: false },
    { host: focusHost({ connected: false }) },
    { host: focusHost({ inert: true }) },
    { modalOpen: true },
  ];

  for (const override of blocked) {
    let calls = 0;
    const focused = focusMountedTerminal({
      id: 7,
      focusedId: 7,
      active: true,
      host: focusHost(),
      modalOpen: false,
      focus: () => { calls += 1; },
      ...override,
    });
    assert.equal(focused, false);
    assert.equal(calls, 0);
  }
});

test("an overlay restores only the pane that stayed logically focused", () => {
  let focusedId = 4;
  const calls = [];
  let pending = null;
  const readFocus = () => ({
    focusedId,
    setFocus: (id) => calls.push(id),
  });
  const schedule = (callback) => { pending = callback; };

  restoreTerminalFocusAfterOverlay(4, readFocus, schedule);
  assert.deepEqual(calls, []);
  pending();
  assert.deepEqual(calls, [4]);

  restoreTerminalFocusAfterOverlay(4, readFocus, schedule);
  focusedId = 9;
  pending();
  assert.deepEqual(calls, [4], "a newer pane selection must win");
});

test("all interactive entry points preserve the focus handoff", async () => {
  const [view, store, toasts, palette, modalFocus, changelog] = await Promise.all([
    read("src/components/terminal/TerminalView.tsx"),
    read("src/state/terminalStore.ts"),
    read("src/components/notifications/Toasts.tsx"),
    read("src/components/layout/paletteAttentionEntries.ts"),
    read("src/lib/useModalFocus.ts"),
    read("src/components/changelog/PostUpdateChangelog.tsx"),
  ]);

  assert.match(view, /mountTerminal\([\s\S]*requestAnimationFrame\([\s\S]*focusMountedTerminal\(/);
  assert.match(view, /onMouseDown=\{\(\) => useTerminalStore\.getState\(\)\.setFocus\(id\)\}/);
  assert.match(store, /setFocus:[\s\S]*container\.isConnected[\s\S]*closest\("\[inert\]"\)/);
  assert.match(toasts, /answerAgentPrompt\([\s\S]*dismiss\(item\.id\)[\s\S]*restoreTerminalFocusAfterOverlay\(/);
  assert.match(palette, /function answer\([\s\S]*answerAgentPrompt\([\s\S]*focus\(pane\)/);
  assert.match(modalFocus, /removeAttribute\("inert"\)[\s\S]*onAfterRestore\?\.\(\)/);
  assert.match(
    changelog,
    /useModalFocus\(\s*dialogRef,[\s\S]*?"#root > :not\(\.post-update-changelog\)",[\s\S]*?restoreTerminalFocus,\s*\)/,
  );
});
