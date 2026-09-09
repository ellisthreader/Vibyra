import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("sign-in needs no autoplay or video decoding and keeps decoration hidden from assistive technology", async () => {
  const source = await read("components/auth/AuthBackdrop.tsx");
  assert.doesNotMatch(source, /<video|autoPlay|\.mp4|setInterval|requestAnimationFrame/);
  assert.match(source, /aria-hidden/);
});

test("sign-in follows the selected theme and supports a narrow window", async () => {
  const [screen, css, backdrop] = await Promise.all([
    read("components/auth/AuthScreen.tsx"), read("styles/auth.css"), read("styles/auth-backdrop.css"),
  ]);
  assert.doesNotMatch(screen, /data-theme="dark"/);
  assert.match(css, /background: var\(--workspace\)/);
  assert.match(css, /max-width: 760px/);
  assert.doesNotMatch(backdrop, /animation:|url\(/);
});

test("account creation does not offer password recovery", async () => {
  const emailForm = await readFile(new URL("../src/components/auth/AuthEmailForm.tsx", import.meta.url), "utf8");
  const authScreen = await readFile(new URL("../src/components/auth/AuthScreen.tsx", import.meta.url), "utf8");
  const accountStore = await readFile(new URL("../src/state/accountStore.ts", import.meta.url), "utf8");

  assert.match(emailForm, /recovering \|\| mode === "login"/);
  assert.match(emailForm, /recovering \? "Back to log in" : "Forgot password\?"/);
  assert.match(emailForm, /onResetError\(\)/);
  assert.match(authScreen, /getState\(\)\.clearError\(\)/);
  assert.match(accountStore, /snapshot: \{ \.\.\.get\(\)\.snapshot, error: null \}/);
});
