import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const flush = () => new Promise((resolve) => setImmediate(resolve));

async function mount(nativeAvailable, overrides = {}) {
  const source = await readFile(new URL("../src/lib/useGlobalShortcuts.ts", import.meta.url), "utf8");
  const body = stripTypeScriptTypes(source.replace(/^import[\s\S]*?;\r?\n/gm, "").replace(/^export /gm, ""));
  const settings = { voiceShortcut: "F8", screenshotShortcut: "F9", talkShortcut: "F10", ...overrides };
  const effects = [], listeners = new Map(), callbacks = new Map(), registrations = [], errors = [];
  const called = { voice: 0, screenshot: 0, talk: 0 };
  const store = (value) => Object.assign((selector) => selector(value), { getState: () => value });
  const dependencies = {
    invoke: async (command) => {
      assert.equal(command, "native_shortcuts_available");
      return typeof nativeAvailable === "function" ? nativeAvailable() : nativeAvailable;
    },
    // This deliberately reports success even on Wayland, reproducing the
    // plugin's disconnected-X11-worker bug. It must never be called there.
    register: async (key, callback) => { registrations.push(key); callbacks.set(key, callback); },
    unregister: async (key) => { callbacks.delete(key); },
    useEffect: (effect) => { effects.push(effect()); },
    useSettingsStore: store({ settings }),
    useProjectStore: store({ view: "project", activeId: "one" }),
    useTerminalStore: store({ panes: [] }),
    useWorkspaceStore: store({ setError: (error) => errors.push(error) }),
    useVoiceStore: store({ toggle: () => { called.voice++; }, cancel: () => {} }),
    useTalkStore: store({ end: () => {}, toggle: () => { called.talk++; } }),
    useScreenshotStore: store({ capture: () => { called.screenshot++; } }),
    shortcutFromEvent: (event) => event.shortcut,
    appModifier: () => false,
    document: {
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); },
    },
  };
  const run = new Function(...Object.keys(dependencies), `${body}\nreturn { useGlobalShortcuts, setShortcutCaptureActive };`);
  const hook = run(...Object.values(dependencies));
  hook.useGlobalShortcuts();
  await flush();
  return {
    called, registrations, callbacks, errors, hook,
    press(shortcut, repeat = false) {
      listeners.get("keydown")?.({ shortcut, code: shortcut, repeat, preventDefault() {}, stopPropagation() {} });
    },
    async cleanup() { effects.forEach((cleanup) => cleanup?.()); await flush(); },
  };
}

test("Wayland keeps F8/F9/F10 and configured keys working despite false-success native registration", async () => {
  for (const keys of [
    { voiceShortcut: "F8", screenshotShortcut: "F9", talkShortcut: "F10" },
    { voiceShortcut: "CommandOrControl+Shift+V", screenshotShortcut: "Alt+F10", talkShortcut: "CommandOrControl+Shift+T" },
  ]) {
    const fixture = await mount(false, keys);
    try {
      assert.deepEqual(fixture.registrations, []);
      fixture.press(keys.voiceShortcut);
      fixture.press(keys.screenshotShortcut);
      fixture.press(keys.talkShortcut);
      fixture.press(keys.voiceShortcut, true);
      assert.deepEqual(fixture.called, { voice: 1, screenshot: 1, talk: 1 });
      fixture.hook.setShortcutCaptureActive(true);
      fixture.press(keys.voiceShortcut);
      fixture.press(keys.talkShortcut);
      assert.equal(fixture.called.voice, 1, "choosing a shortcut must not start the microphone");
      assert.equal(fixture.called.talk, 1, "choosing a shortcut must not start a spoken conversation");
      assert.deepEqual(fixture.errors, []);
    } finally { await fixture.cleanup(); }
  }
});

test("Mac and X11 retain native activation without double-firing the focused fallback", async () => {
  const fixture = await mount(true);
  try {
    assert.ok(fixture.registrations.includes("F8"));
    assert.ok(fixture.registrations.includes("F9"));
    assert.ok(fixture.registrations.includes("F10"));
    fixture.press("F8");
    fixture.press("F9");
    fixture.press("F10");
    assert.deepEqual(fixture.called, { voice: 0, screenshot: 0, talk: 0 });
    fixture.callbacks.get("F8")({ state: "Pressed" });
    fixture.callbacks.get("F8")({ state: "Released" });
    fixture.callbacks.get("F9")({ state: "Pressed" });
    fixture.callbacks.get("F10")({ state: "Pressed" });
    assert.deepEqual(fixture.called, { voice: 1, screenshot: 1, talk: 1 });
  } finally { await fixture.cleanup(); }
});

test("a failed native capability probe leaves focused shortcuts available", async () => {
  const fixture = await mount(() => { throw new Error("native IPC unavailable"); });
  try {
    fixture.press("F8");
    fixture.press("F9");
    fixture.press("F10");
    assert.deepEqual(fixture.registrations, []);
    assert.deepEqual(fixture.called, { voice: 1, screenshot: 1, talk: 1 });
  } finally { await fixture.cleanup(); }
});
