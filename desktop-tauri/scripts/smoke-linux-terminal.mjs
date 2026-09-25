// Exercise keyboard -> WebKitGTK -> xterm -> Tauri IPC -> a real Linux PTY.
// Run: dbus-run-session -- xvfb-run -a node scripts/smoke-linux-terminal.mjs app.AppImage
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { NativeDriver } from "./linux-terminal-webdriver.mjs";
import { probePaint } from "./linux-terminal-paint.mjs";
import { receiveReport, verifyProjectActions } from "./linux-terminal-ux.mjs";
import { verifyLinuxOnboardingAndReport } from "./linux-model-notice-smoke.mjs";
if (process.platform !== "linux") throw new Error("Native terminal verification requires Linux");
const application = resolve(process.argv[2] || "");
if (!application.endsWith(".AppImage") || !existsSync(application)) {
  throw new Error("Pass an existing Linux .AppImage");
}
const output = resolve(process.argv[3] || "release/linux-terminal-smoke");
mkdirSync(output, { recursive: true });
chmodSync(application, 0o755);
const profile = mkdtempSync(join(tmpdir(), "vibyra-terminal-smoke-"));
const project = join(profile, "input-repro");
mkdirSync(project, { recursive: true });
const config = join(profile, "config", "vibyra-desktop");
mkdirSync(config, { recursive: true });
writeFileSync(join(config, "settings.json"), JSON.stringify({
  defaultShell: "/bin/sh",
  projects: [{ id: "input-repro", name: "input-repro", root: project,
    color: "#5b7cfa", lastOpenedMs: Date.now() }],
  activeProjectId: "input-repro",
}));

const user = { id: "native-terminal-smoke", name: "Linux QA",
  email: "linux-qa@example.invalid", provider: "email", plan: "free",
  emailVerified: true };
const reports = [];
const api = createServer((request, response) => {
  const send = (status, body) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (request.url === "/api/auth/login" && request.method === "POST") {
    request.resume();
    send(200, { ok: true, token: "terminal-smoke-local-token", user });
  } else if (request.url === "/api/session") {
    send(200, { ok: true, user });
  } else if (request.url === "/api/auth/session/rotate") {
    send(200, { ok: true, token: "terminal-smoke-local-token" });
  } else if (request.url === "/api/account/profile") {
    send(200, { ok: true, user });
  } else if (request.url === "/api/reports/ready" && request.method === "GET") {
    if (request.headers.authorization === "Bearer terminal-smoke-local-token") {
      send(503, { ok: false, error: "Temporary readiness failure" });
    } else {
      send(401, { ok: false, error: "Sign in to report a problem." });
    }
  } else if (request.url === "/api/reports" && request.method === "POST") {
    receiveReport(request, send, reports);
  } else {
    send(404, { ok: false, error: "Unavailable in isolated terminal smoke" });
  }
});
await new Promise((done) => api.listen(0, "127.0.0.1", done));
const apiPort = api.address().port;
const env = {
  ...process.env, APPIMAGE_EXTRACT_AND_RUN: "1", GDK_BACKEND: "x11",
  VIBYRA_DESKTOP_API_URL: `http://127.0.0.1:${apiPort}`,
  VIBYRA_DESKTOP_STATE_DIR: config,
  XDG_CONFIG_HOME: join(profile, "config"), XDG_DATA_HOME: join(profile, "data"),
  XDG_CACHE_HOME: join(profile, "cache"),
};
const port = Number(process.env.VIBYRA_TERMINAL_WEBDRIVER_PORT || 4446);
const processDriver = spawn("tauri-driver", ["--port", String(port), "--native-port", String(port + 1)], { env });
const driver = new NativeDriver(port, processDriver);
let log = "";
let failure;
for (const stream of [processDriver.stdout, processDriver.stderr]) {
  stream.on("data", bytes => { log += bytes.toString(); });
}
processDriver.on("error", error => { failure = error; });

async function snapshot(id) {
  return driver.invoke("terminal_snapshot", { id });
}
async function enterAndCheck(id, command, marker, name) {
  const started = performance.now();
  await driver.keyboard(`${command}\uE007`);
  await driver.until(async () => {
    const raw = await snapshot(id);
    return new RegExp(`(?:\\r|\\n)${marker}(?:\\r|\\n)`).test(raw);
  }, `${name}: exact command result`);
  return Math.round(performance.now() - started);
}
try {
  console.log("Opening the real AppImage against a local account fixture");
  await driver.start(application);
  await driver.until(() => driver.execute(`return Boolean(document.querySelector('.auth-card h1'))`), "sign-in UI");
  await driver.click("button.auth-email-toggle, button[title='Continue with email']")
    .catch(async () => {
      const button = await driver.execute(`return [...document.querySelectorAll('button')]
        .find(button => button.textContent.trim() === 'Continue with email')?.outerHTML`);
      if (!button) throw new Error("Continue with email button was absent");
      await driver.execute(`const button = [...document.querySelectorAll('button')]
        .find(button => button.textContent.trim() === 'Continue with email'); button.click();`);
    });
  await driver.until(() => driver.execute(`const input = document.querySelector('input[aria-label="Email address"]');
    const reveal = document.querySelector('.auth-reveal--form.auth-reveal--open');
    const form = reveal?.querySelector('.auth-email');
    return Boolean(input && form && !reveal.inert && input.getBoundingClientRect().height > 0
      && Number(getComputedStyle(form).opacity) > 0.99);`), "interactive email form");
  await driver.keys('input[aria-label="Email address"]', user.email);
  await driver.keys('input[aria-label="Password"]', "local-only-password");
  // Submit the form after WebDriver fills it; the reveal can still clip the button.
  await driver.execute(`document.querySelector('.auth-email').requestSubmit()`);
  await driver.until(() => driver.execute(`return Boolean(document.querySelector('.homeview, .project-workspace'))`), "authenticated workspace");
  await verifyLinuxOnboardingAndReport(driver, output, reports);
  await driver.until(() => driver.execute(`return Boolean(document.querySelector('button[aria-label="New terminal in input-repro"]'))`), "test project");
  await driver.until(() => driver.execute(`const card = document.querySelector('button[aria-label="Open input-repro"]');
    if (!card) return false; const rect = card.getBoundingClientRect();
    return card.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));`),
  "project card unobscured");
  // The card's plus is hidden until hover at desktop widths. Invoke its real
  // React handler; terminal keys still go through native WebDriver and PTY.
  await driver.execute(`document.querySelector('button[aria-label="New terminal in input-repro"]').click()`);
  await driver.until(() => driver.execute(`return Boolean(document.querySelector('button[title="Launch Terminal"]'))`), "system shell in terminal picker");
  await driver.click('button[title="Launch Terminal"]');
  const id = await driver.until(async () => {
    const id = await driver.execute(`return Number(document.querySelector('.pane[data-pane-id]')?.dataset.paneId || 0)`);
    return id || false;
  }, "real PTY pane");
  await driver.until(() => driver.execute(`return Boolean(document.querySelector('.pane .xterm-helper-textarea'))`), "xterm input");
  await driver.until(() => driver.execute(`const input = document.querySelector('.pane .xterm-helper-textarea');
    return Boolean(input && document.activeElement === input);`), "new terminal received keyboard focus");
  await driver.until(async () => (await snapshot(id)).length > 0, "shell prompt");
  const stepMarker = "vibyrastep123456789";
  const stepCommand = `echo ${stepMarker}`;
  for (let index = 0; index < stepCommand.length; index += 1) {
    await driver.keyboard(stepCommand[index]);
    const expected = stepCommand.slice(0, index + 1);
    await driver.until(async () => (await snapshot(id)).includes(expected),
      `character ${index + 1} echoed by PTY`, 3_000);
    if (index === stepCommand.length - 2)
      writeFileSync(join(output, "terminal-echo-penultimate.png"), await driver.screenshot());
  }
  writeFileSync(join(output, "terminal-echo-final.png"), await driver.screenshot());
  await delay(100); writeFileSync(join(output, "terminal-echo-after-100ms.png"), await driver.screenshot());
  await delay(400); writeFileSync(join(output, "terminal-echo-after-500ms.png"), await driver.screenshot());
  writeFileSync(join(output, "terminal-echo-state.json"), JSON.stringify({ documentHidden: await driver.execute("return document.hidden"), terminals: await driver.invoke("list_terminals"), renderer: await driver.invoke("renderer_policy") }, null, 2));
  await driver.keyboard("\uE007");
  await driver.until(async () => new RegExp(`(?:\\r|\\n)${stepMarker}(?:\\r|\\n)`).test(await snapshot(id)),
    "single-character command output");
  const burstToOutputMs = [];
  for (let index = 0; index < 12; index += 1) {
    const marker = `vibyraburst${String(index).padStart(2, "0")}abcdefghijklmnopqrstuvwxyz`;
    burstToOutputMs.push(await enterAndCheck(id, `echo ${marker}`, marker, `burst ${index + 1}`));
  }
  await driver.keyboard(`echo vibyrawrong${"\uE003".repeat(5)}right\uE007`);
  await driver.until(async () => /(?:\r|\n)vibyraright(?:\r|\n)/.test(await snapshot(id)),
    "backspace-corrected command output");
  // Codex Plan mode uses Shift+Tab. Check its underlying xterm translation
  // against a real PTY, with cat -v making the Escape [ Z bytes observable.
  await driver.keyboard("cat -v\uE007");
  await driver.keyboard("vibyracatready\uE007");
  await driver.until(async () => (await snapshot(id)).split("vibyracatready").length >= 3,
    "cat -v ready to receive terminal control keys");
  const beforeShiftTab = (await snapshot(id)).length;
  await driver.keyboard("\uE008\uE004\uE000\uE007");
  await driver.until(async () => (await snapshot(id)).slice(beforeShiftTab).includes("^[[Z"),
    "Shift+Tab arrived at the Linux PTY as Escape [ Z");
  const paintMarker = await probePaint(driver, output, () => snapshot(id));
  await driver.until(async () => (await snapshot(id)).includes(paintMarker), "unpolled PTY typing");
  await verifyProjectActions(driver);
  writeFileSync(join(output, "terminal-input.png"), await driver.screenshot());
  writeFileSync(join(output, "terminal-input.json"), JSON.stringify({
    appImage: application, nativePty: id, characterEcho: stepCommand.length,
    terminalAutofocus: true, linuxNewModelsNotice: true,
    burstCommands: 12, burstToOutputMs, backspace: true, shiftTabEscape: true,
    accountService: "loopback fixture", reportBugVisible: true, reportDeliveredAfterReadinessFailure: true,
    projectRightClick: true, projectRename: true, projectCloseConfirmation: true,
  }, null, 2));
  console.log(`Native Linux PTY typing passed. Evidence: ${output}`);
} catch (error) {
  failure = error;
  console.error(error);
  if (driver.session) {
    try { writeFileSync(join(output, "failure.png"), await driver.screenshot()); }
    catch { /* Keep the original error. */ }
  }
} finally {
  processDriver.kill("SIGKILL");
  processDriver.stdout.destroy();
  processDriver.stderr.destroy();
  api.closeAllConnections();
  api.close();
  writeFileSync(join(output, "tauri-driver.log"), log);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  catch (error) { console.warn(`Disposable terminal profile cleanup deferred: ${error}`); }
}
process.exit(failure ? 1 : 0);
