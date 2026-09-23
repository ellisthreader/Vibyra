import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";

import { desktopPlatformFor, terminalBacktabKey } from "../src/lib/platform.ts";

const source = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("Linux uses bundled fonts while the installed Mac font stack is preserved", async () => {
  const [tokens, main, workspace, conversation] = await Promise.all([
    source("styles/tokens.css"), source("main.tsx"), source("styles/workspace-font.css"),
    source("components/terminal/conversationTerminal.css"),
  ]);
  assert.match(tokens, /--font-ui:\s*"Inter Variable"/);
  assert.match(tokens, /--font-mono:\s*"JetBrains Mono Variable"/);
  assert.match(main, /import "@fontsource-variable\/inter"/);
  assert.match(main, /import "@fontsource-variable\/jetbrains-mono"/);
  assert.match(workspace, /@font-face\s*\{[^}]*font-family:'DM Sans';[^}]*DMSans\.ttf/);
  assert.match(conversation, /font-family:var\(--font-sans,Inter,system-ui,sans-serif\)/);
  assert.match(tokens, /:root\[data-platform="mac"\]\s*\{[^}]*--font-ui:\s*-apple-system/);
  assert.doesNotMatch(tokens, /:root\[data-platform="linux"\]\s*\{[^}]*--font-ui:/);
  const files = await readdir(new URL("../src/", import.meta.url), { recursive: true });
  for (const path of files.filter((path) => path.endsWith(".css"))) {
    const css = await source(path);
    assert.doesNotMatch(css, /data-platform="linux"[^{}]*\{[^{}]*(?:--font-ui\s*:|font(?:-family)?\s*:)/,
      `${path} must not override Linux's bundled UI font`);
  }
});

test("Linux desktop architectures are detected without changing Mac or Windows", () => {
  for (const platform of ["Linux x86_64", "Linux aarch64", "Linux armv8l"]) {
    assert.equal(desktopPlatformFor(platform), "linux", platform);
  }
  for (const platform of ["MacIntel", "MacPPC", "iPad", "iPhone"]) {
    assert.equal(desktopPlatformFor(platform), "mac", platform);
  }
  for (const platform of ["Win32", "Win64", ""]) {
    assert.equal(desktopPlatformFor(platform), "desktop", platform);
  }
});

test("Linux's native title bar preserves base window settings after Tauri's array replacement", async () => {
  const [base, linux] = await Promise.all([
    readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
    readFile(new URL("../src-tauri/tauri.linux.conf.json", import.meta.url), "utf8"),
  ]).then((values) => values.map(JSON.parse));
  const original = base.app.windows[0];
  const native = linux.app.windows[0];
  assert.deepEqual(native, { ...original, decorations: true });
  assert.equal(original.decorations, false, "Windows retains its custom controls");
});

test("the detected computer determines native copy and keyboard actions together", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const cases = [
    { platform: "MacIntel", kind: "mac", name: "Mac", computer: "Mac", shortcut: "⌘⇧1" },
    { platform: "Linux x86_64", kind: "linux", name: "Linux", computer: "computer", shortcut: "Ctrl Shift 1" },
    { platform: "Linux aarch64", kind: "linux", name: "Linux", computer: "computer", shortcut: "Ctrl Shift 1" },
    { platform: "Win32", kind: "desktop", name: "Windows", computer: "computer", shortcut: "Ctrl Shift 1" },
  ];
  try {
    for (const fixture of cases) {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: { platform: fixture.platform } });
      const url = new URL("../src/lib/platform.ts", import.meta.url);
      url.searchParams.set("platform-test", fixture.platform);
      const platform = await import(url.href);
      assert.equal(platform.desktopPlatform, fixture.kind);
      assert.equal(platform.isMac, fixture.kind === "mac");
      assert.equal(platform.isLinux, fixture.kind === "linux");
      assert.equal(platform.platformName, fixture.name);
      assert.equal(platform.computerName, fixture.computer);
      assert.equal(platform.keyLabel("Mod+Shift+1"), fixture.shortcut);
      assert.equal(platform.appModifier({ ctrlKey: true, metaKey: false }), fixture.kind !== "mac");
      assert.equal(platform.appModifier({ ctrlKey: false, metaKey: true }), fixture.kind === "mac");

      const paste = { type: "keydown", code: "KeyV", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
      assert.equal(platform.terminalPasteKey(paste), false, "plain Control V remains a terminal key");
      assert.equal(platform.terminalPasteKey({ ...paste, shiftKey: true }), true);
      assert.equal(platform.terminalPasteKey({ ...paste, ctrlKey: false, metaKey: true }), fixture.kind === "mac");
    }
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  }
});

test("Linux backtab reaches CLI mode switches even with WebKit's ISO_Left_Tab key", () => {
  const key = { type: "keydown", code: "Tab", key: "Tab", shiftKey: true, ctrlKey: false, metaKey: false, altKey: false };
  assert.equal(terminalBacktabKey(key, true), true);
  assert.equal(terminalBacktabKey({ ...key, code: "", key: "ISO_Left_Tab", shiftKey: false }, true), true);
  assert.equal(terminalBacktabKey({ ...key, key: "BackTab", shiftKey: false }, true), true);
  assert.equal(terminalBacktabKey({ ...key, shiftKey: false }, true), false);
  assert.equal(terminalBacktabKey({ ...key, ctrlKey: true }, true), false);
  assert.equal(terminalBacktabKey(key, false), false);
});
