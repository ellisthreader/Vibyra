import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../src/components/auth/AuthBackdrop.tsx", import.meta.url);
const videoComponentPath = new URL("../src/components/auth/AuthBackdropVideo.tsx", import.meta.url);
const authCssPath = new URL("../src/styles/auth.css", import.meta.url);
const backdropCssPath = new URL("../src/styles/auth-backdrop.css", import.meta.url);
const mainPath = new URL("../src/main.tsx", import.meta.url);
const tauriConfigPath = new URL("../src-tauri/tauri.conf.json", import.meta.url);
const videoPath = new URL("../src/assets/auth-space-loop.mp4", import.meta.url);
const posterPath = new URL("../src/assets/auth-space-loop-poster.webp", import.meta.url);

test("auth background uses a silent local loop with a matching poster", async () => {
  const [source, video] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(videoComponentPath, "utf8"),
  ]);
  assert.match(video, /auth-space-loop\.mp4\?inline/);
  assert.match(source, /auth-space-loop-poster\.webp/);
  for (const attribute of ["autoPlay", "muted", "loop", "playsInline"]) {
    assert.match(video, new RegExp(`\\b${attribute}\\b`));
  }
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(video, /prefers-reduced-motion: reduce/);
  assert.match(video, /onCanPlay=\{startPlayback\}/);
});

// The inlined loop is ~3.5 MB of JavaScript. Importing it eagerly puts that
// payload in the chunk the app must parse before first paint, which is how it
// shipped until 2026-08-22 — pin the split so it cannot silently come back.
test("the inlined loop stays out of the startup chunk", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /lazy\(\(\) => import\("\.\/AuthBackdropVideo"\)\)/);
  assert.doesNotMatch(source, /auth-space-loop\.mp4/);
  assert.match(source, /<Suspense fallback=\{null\}>/);
});

test("production CSP allows the inlined video source", async () => {
  const config = JSON.parse(await readFile(tauriConfigPath, "utf8"));
  assert.match(config.app.security.csp, /media-src 'self' data:/);
});

test("poster fallback owns startup while the video fades in", async () => {
  const [authCss, backdropCss, main] = await Promise.all([
    readFile(authCssPath, "utf8"),
    readFile(backdropCssPath, "utf8"),
    readFile(mainPath, "utf8"),
  ]);
  assert.doesNotMatch(authCss, /auth-drift/);
  assert.match(backdropCss, /auth__backdrop--video\.is-ready/);
  assert.match(main, /styles\/auth-backdrop\.css/);
});

test("bundled auth media is compact and has the expected containers", async () => {
  const [video, poster, videoInfo, posterInfo] = await Promise.all([
    readFile(videoPath),
    readFile(posterPath),
    stat(videoPath),
    stat(posterPath),
  ]);
  assert.equal(video.subarray(4, 8).toString("ascii"), "ftyp");
  assert.equal(poster.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(poster.subarray(8, 12).toString("ascii"), "WEBP");
  assert.ok(videoInfo.size < 5_000_000);
  assert.ok(posterInfo.size < 500_000);
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
