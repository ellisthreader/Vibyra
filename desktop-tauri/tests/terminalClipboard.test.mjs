import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { clipboardIntent } from "../src/lib/terminalClipboardKeys.ts";

function chord(code, keys = {}) {
  return {
    code,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...keys,
  };
}

/**
 * Copy never worked at all before this: nothing in the app read the selection,
 * xterm ships no copy chord of its own, and the page sets `user-select: none`
 * so WebKit had no DOM selection to copy either.
 */
test("the shifted chord copies, on every platform's spelling", () => {
  assert.equal(clipboardIntent(chord("KeyC", { ctrlKey: true, shiftKey: true })), "copy");
  // macOS: the webview's own Cmd+C cannot see xterm's selection either.
  assert.equal(clipboardIntent(chord("KeyC", { metaKey: true })), "copy");
});

/**
 * The one rule worth a test of its own. ^C is the only way to interrupt an
 * agent mid-answer; a copy feature that swallows it would be a worse bug than
 * the missing copy it fixed.
 */
test("plain Ctrl+C stays the interrupt", () => {
  assert.equal(clipboardIntent(chord("KeyC", { ctrlKey: true })), "ignore");
  // Alt is somebody else's modifier — never ours.
  assert.equal(
    clipboardIntent(chord("KeyC", { ctrlKey: true, shiftKey: true, altKey: true })),
    "ignore",
  );
});

test("paste keeps the chords it already had", () => {
  assert.equal(clipboardIntent(chord("KeyV", { ctrlKey: true, shiftKey: true })), "paste");
  // Plain Ctrl+V is cancelled but not consumed, so ^V reaches the process as
  // readline's quoted-insert instead of pasting behind its back.
  assert.equal(clipboardIntent(chord("KeyV", { ctrlKey: true })), "control-code");
  assert.equal(clipboardIntent(chord("KeyV", { metaKey: true })), "ignore");
  assert.equal(clipboardIntent(chord("KeyV")), "ignore");
});

test("keys that are not clipboard keys are left alone", () => {
  assert.equal(clipboardIntent(chord("KeyX", { ctrlKey: true, shiftKey: true })), "ignore");
  assert.equal(clipboardIntent(chord("Enter")), "ignore");
});

/**
 * The selection has to reach the OS clipboard through Rust: `arboard` holds a
 * process-lifetime handle because on X11 the clipboard owner must stay alive
 * to serve what it copied.
 */
test("copying goes out through the native clipboard, and right-click copies too", () => {
  const clipboard = readFileSync(new URL("../src/lib/terminalClipboard.ts", import.meta.url), "utf8");
  const native = readFileSync(
    new URL("../src-tauri/src/commands/clipboard.rs", import.meta.url),
    "utf8",
  );
  const registry = readFileSync(
    new URL("../src-tauri/src/commands/registry.rs", import.meta.url),
    "utf8",
  );

  assert.match(clipboard, /writeClipboardText\(selection\)/);
  assert.match(clipboard, /addEventListener\("contextmenu"/);
  assert.match(native, /pub async fn write_clipboard_text/);
  assert.match(native, /pub\(crate\) fn copy_text[\s\S]*?with_clipboard/);
  assert.match(native, /set_text\(text\.to_owned\(\)\)/);
  assert.match(native, /run_blocking\(move \|\| copy_text\(&text\)\)/);
  assert.match(registry, /clipboard::write_clipboard_text/);
});
