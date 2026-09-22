// Real AppImage + WebKitGTK smoke test. No mocked IPC or account service.
// Run in a disposable Linux CI session: dbus-run-session -- xvfb-run -a node ...
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

if (process.platform !== "linux") throw new Error("Native AppImage smoke verification requires Linux.");
const application = resolve(process.argv[2] || "");
if (!application.endsWith(".AppImage") || !existsSync(application)) throw new Error("Pass an existing .AppImage.");
const output = resolve(process.argv[3] || "release/linux-smoke");
mkdirSync(output, { recursive: true });
chmodSync(application, 0o755);
const profile = mkdtempSync(join(tmpdir(), "vibyra-native-smoke-"));
// Keep HOME intact: changing system shell variables can affect unrelated tools.
// App storage is isolated through the platform's standard XDG directories.
const env = {
  ...process.env, APPIMAGE_EXTRACT_AND_RUN: "1", GDK_BACKEND: "x11",
  XDG_CONFIG_HOME: join(profile, "config"), XDG_DATA_HOME: join(profile, "data"),
  XDG_CACHE_HOME: join(profile, "cache"),
};
const port = Number(process.env.VIBYRA_WEBDRIVER_PORT || 4444);
const driver = spawn("tauri-driver", ["--port", String(port), "--native-port", String(port + 1)], { env });
let log = "";
let driverError;
let session;
for (const stream of [driver.stdout, driver.stderr]) stream.on("data", (bytes) => { log += bytes.toString(); });
driver.on("error", (error) => { driverError = error; });

async function request(method, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45_000),
  });
  const result = await response.json();
  if (!response.ok || result.value?.error) throw new Error(result.value?.message || JSON.stringify(result));
  return result.value;
}
async function until(check, description) {
  const deadline = Date.now() + 45_000;
  let last;
  while (Date.now() < deadline) {
    if (driverError || driver.exitCode !== null) throw driverError || new Error(`tauri-driver exited ${driver.exitCode}.`);
    try { const result = await check(); if (result) return result; } catch (error) { last = error; }
    await delay(250);
  }
  throw new Error(`${description} timed out. ${last?.message || ""}`);
}
const execute = (script, args = []) => request("POST", `/session/${session}/execute/sync`, { script, args });
async function capture(name) {
  const screenshot = await request("GET", `/session/${session}/screenshot`);
  writeFileSync(join(output, `${name}.png`), Buffer.from(screenshot, "base64"));
}

try {
  await until(() => request("GET", "/status"), "WebKit driver startup");
  const result = await request("POST", "/session", { capabilities: { alwaysMatch: {
    browserName: "wry", "tauri:options": { application },
  } } });
  session = result.sessionId;
  assert.ok(session, "WebKit did not create an application session.");
  await request("POST", `/session/${session}/window/rect`, { width: 1440, height: 900, x: 0, y: 0 });
  await until(() => execute(`return document.querySelector('.auth-card h1')?.textContent === 'Welcome to Vibyra'
    && [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Continue with email' && !button.disabled)`), "Native sign-in view");
  await until(() => execute(`return document.fonts.status === 'loaded'
    && [...document.images].every(image => image.complete && image.naturalWidth > 0)`), "Embedded fonts and images");
  const nativeVersion = await request("POST", `/session/${session}/execute/async`, {
    script: `const done = arguments[arguments.length - 1];
      window.__TAURI_INTERNALS__.invoke('plugin:app|version')
        .then(version => done({ version }), error => done({ error: String(error) }));`, args: [],
  });
  const configPath = resolve(dirname(fileURLToPath(import.meta.url)), "../src-tauri/tauri.conf.json");
  assert.equal(nativeVersion.version, JSON.parse(readFileSync(configPath, "utf8")).version, "The running native app version is stale or native IPC failed.");
  const initial = await execute(`return {
    title: document.title, heading: document.querySelector('.auth-card h1').textContent,
    platform: navigator.platform, width: innerWidth, height: innerHeight,
    font: getComputedStyle(document.body).fontFamily,
    background: getComputedStyle(document.body).backgroundColor,
    imageFailures: [...document.images].filter(img => !img.complete || !img.naturalWidth).map(img => img.src),
    nativeIpc: Boolean(window.__TAURI_INTERNALS__),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth
  }`);
  assert.equal(initial.nativeIpc, true, "The native IPC bridge did not initialize.");
  assert.deepEqual(initial.imageFailures, [], "An embedded image failed to load.");
  assert.equal(initial.horizontalOverflow, false, "The native sign-in view overflows its window.");
  await capture("sign-in");
  const emailButton = await request("POST", `/session/${session}/element`, {
    using: "xpath", value: "//button[normalize-space(.)='Continue with email']",
  });
  await request("POST", `/session/${session}/element/${emailButton["element-6066-11e4-a52e-4f735466cecf"]}/click`, {});
  await until(() => execute(`const input = document.querySelector('input[aria-label="Email address"]');
    return document.querySelector('.auth-card h1')?.textContent === 'Welcome back.' && input && input.getBoundingClientRect().height > 0`), "Email form navigation");
  await capture("email-form");
  writeFileSync(join(output, "native-smoke.json"), `${JSON.stringify({ ...initial, nativeVersion: nativeVersion.version, emailNavigation: true }, null, 2)}\n`);
  console.log(`Native Linux AppImage sign-in, assets, IPC and email navigation passed. Evidence: ${output}`);
} finally {
  if (session) {
    try { await capture("final"); } catch { /* Preserve logs even when the web process failed. */ }
    try { await request("DELETE", `/session/${session}`); } catch { /* Driver cleanup below. */ }
  }
  driver.kill("SIGTERM");
  writeFileSync(join(output, "tauri-driver.log"), log);
  rmSync(profile, { recursive: true, force: true });
}
