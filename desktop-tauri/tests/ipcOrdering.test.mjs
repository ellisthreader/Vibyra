import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Keystroke ordering currently holds because of the CSP, not in spite of it.
//
// Tauri 2 routes every `invoke` through `fetch()` on the `ipc://` custom
// protocol on Linux, and fetches are unordered — two keystrokes can reach Rust
// swapped. Because `connect-src` does not allow `ipc:`/`http://ipc.localhost`,
// the first invoke is CSP-blocked, the runtime flips to its fallback, and every
// call rides WebKit's `postMessage`, which IS delivered in order. Tauri's docs
// suggest adding those CSP entries as a *performance* tip; doing so would
// silently reintroduce keystroke reordering (the 0.1.9 bug class). This test is
// the tripwire.

const conf = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);

test("the CSP keeps Tauri's unordered custom-protocol IPC disabled", () => {
  const csp = conf.app.security.csp;
  assert.equal(typeof csp, "string", "a removed CSP enables the unordered IPC path");
  assert.ok(!csp.includes("ipc:"), "connect-src must not allow ipc:");
  assert.ok(!csp.includes("ipc.localhost"), "connect-src must not allow http://ipc.localhost");
});
