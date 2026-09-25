// Runs the installed app's real updater against the live production feed.
// Use only in disposable Linux CI: it replaces the supplied AppImage/install.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NativeDriver } from "./linux-terminal-webdriver.mjs";

assert.equal(process.platform, "linux");
assert.equal(process.env.CI, "true", "Update proof replaces packages and must run in disposable CI");
const [source, expectedVersion, destination] = process.argv.slice(2);
assert.ok(source && expectedVersion && destination, "Pass application, expected version, evidence directory");
const application = resolve(source);
const output = resolve(destination);
mkdirSync(output, { recursive: true });
if (application.endsWith(".AppImage")) chmodSync(application, 0o755);
const profile = mkdtempSync(join(tmpdir(), "vibyra-live-update-"));
const config = join(profile, "config", "vibyra-desktop");
mkdirSync(config, { recursive: true });
writeFileSync(join(config, "settings.json"), JSON.stringify({ performanceMode: "balanced" }));
const env = {
  ...process.env, APPIMAGE_EXTRACT_AND_RUN: "1", GDK_BACKEND: "x11",
  VIBYRA_DESKTOP_STATE_DIR: config, VIBYRA_DESKTOP_API_URL: "http://127.0.0.1:9",
  XDG_CONFIG_HOME: join(profile, "config"), XDG_DATA_HOME: join(profile, "data"),
  XDG_CACHE_HOME: join(profile, "cache"),
};
const child = spawn("tauri-driver", ["--port", "4450", "--native-port", "4451"], { env });
const driver = new NativeDriver(4450, child);
let log = "";
for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => { log += bytes; });
const evidence = { application, expectedVersion };
try {
  await driver.start(application);
  evidence.before = await driver.invoke("plugin:app|version");
  assert.notEqual(evidence.before, expectedVersion, "Must start with an older real package");
  const update = await driver.invoke("plugin:updater|check", { timeout: 15_000 });
  assert.equal(update?.version, expectedVersion, "The production feed must offer the target version");
  evidence.offered = update;
  await driver.execute(`const rid = arguments[0];
    const callback = window.__TAURI_INTERNALS__.transformCallback(() => {});
    window.__updateProof = { stage: 'downloading' };
    window.__TAURI_INTERNALS__.invoke('plugin:updater|download', {
      rid, onEvent: '__CHANNEL__:' + callback, timeout: 120000,
    }).then(bytesRid => {
      window.__updateProof = { stage: 'installing' };
      return window.__TAURI_INTERNALS__.invoke('plugin:updater|install', {
        updateRid: rid, bytesRid, restartAfterInstall: false,
      });
    }).then(() => { window.__updateProof = { stage: 'installed' }; })
      .catch(error => { window.__updateProof = { stage: 'failed', error: String(error) }; });`, [update.rid]);
  const installed = await driver.until(async () => {
    const state = await driver.execute("return window.__updateProof");
    return ['installed', 'failed'].includes(state?.stage) ? state : false;
  }, "signed download and native install", 180_000);
  assert.equal(installed.stage, "installed", installed.error);
  evidence.install = installed;
  // Reopen the same application path, as the frontend does after install().
  await driver.request("DELETE", `/session/${driver.session}`);
  await driver.start(application);
  evidence.after = await driver.invoke("plugin:app|version");
  evidence.renderer = await driver.invoke("renderer_policy");
  assert.equal(evidence.after, expectedVersion, "Reopened app must really be the new version");
  assert.equal(evidence.renderer.softwareCompositing, true);
  assert.equal(evidence.renderer.environmentOverride, false);
  evidence.installedSha256 = createHash("sha256").update(readFileSync(application)).digest("hex");
  writeFileSync(join(output, "after-update.png"), await driver.screenshot());
  console.log(`Live update ${evidence.before} -> ${evidence.after} installed and reopened successfully`);
} finally {
  writeFileSync(join(output, "update-proof.json"), JSON.stringify(evidence, null, 2));
  writeFileSync(join(output, "tauri-driver.log"), log);
  child.kill("SIGKILL");
  child.stdout.destroy(); child.stderr.destroy();
}
