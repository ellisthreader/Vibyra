import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, "..");
const repo = resolve(desktop, "..");
const read = (path) => readFileSync(resolve(desktop, path), "utf8");

test("release scripts package Rust AppImage and NSIS targets", () => {
  const scripts = JSON.parse(read("package.json")).scripts;
  const windows = JSON.parse(read("src-tauri/tauri.windows.conf.json"));

  assert.match(scripts["app:build:linux"], /--bundles appimage/);
  assert.match(scripts["app:build:windows"], /--bundles nsis/);
  assert.match(scripts["app:build:windows:cross"], /cargo-xwin/);
  assert.deepEqual(windows.bundle.targets, ["nsis"]);
  assert.match(windows.bundle.icon.at(-1), /\.ico$/);
});

test("desktop release workflow builds and smoke-tests both public beta packages", () => {
  const workflow = readFileSync(
    resolve(repo, ".github/workflows/desktop-release.yml"),
    "utf8",
  );

  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /ubuntu-22\.04/);
  assert.match(workflow, /app:build:windows/);
  assert.match(workflow, /app:build:linux/);
  assert.match(workflow, /Smoke-test Linux AppImage launch/);
  assert.match(workflow, /Smoke-test Windows installer and app launch/);
  assert.doesNotMatch(workflow, /electron-builder|desktop:package/);

  // Artifacts are named from tauri.conf.json, not a frozen literal — every
  // build used to be stamped 0.1.0-beta.1 whatever it actually was.
  assert.match(workflow, /require\('\.\/src-tauri\/tauri\.conf\.json'\)\.version/);
  assert.doesNotMatch(workflow, /Vibyra-Desktop-0\.1\.0-beta\.1/);

  // An unsigned build cannot be offered as an in-app update, so the release
  // job must both pass the key in and fail if no .sig comes out.
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY \}\}/);
  assert.match(workflow, /test -f "\$\{matches\[0\]\}\.sig"/);
});

test("the updater is configured to sign, verify and reach the release feed", () => {
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  const capabilities = JSON.parse(read("src-tauri/capabilities/default.json"));
  const updater = config.plugins?.updater;

  // Without artifacts there is nothing to serve; without a pubkey the app
  // accepts any bytes the feed hands it. Both are load-bearing.
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.ok(updater, "tauri.conf.json must configure the updater plugin");
  assert.match(updater.pubkey, /^[A-Za-z0-9+/=]+$/, "pubkey is inline base64, never a path");
  assert.ok(updater.pubkey.length > 40, "pubkey looks truncated");

  // `check()` and `relaunch()` are both denied without these.
  assert.ok(capabilities.permissions.includes("updater:default"));
  assert.ok(capabilities.permissions.includes("process:default"));
});

test("the update endpoint matches the route the backend actually serves", () => {
  const updater = JSON.parse(read("src-tauri/tauri.conf.json")).plugins.updater;
  const routes = readFileSync(resolve(repo, "backend/routes/web.php"), "utf8");

  assert.equal(updater.endpoints.length, 1);
  const endpoint = new URL(updater.endpoints[0]);
  assert.equal(endpoint.protocol, "https:", "an update channel must not be plain HTTP");

  // A drift between these two is silent: the app polls forever and every user
  // stays on the build they installed.
  assert.equal(
    endpoint.pathname,
    "/web-api/updates/%7B%7Btarget%7D%7D/%7B%7Barch%7D%7D/%7B%7Bbundle_type%7D%7D/%7B%7Bcurrent_version%7D%7D",
  );
  assert.match(
    routes,
    /'\/web-api\/updates\/\{target\}\/\{arch\}\/\{bundleType\}\/\{current\}'/,
    "backend route shape drifted from the configured endpoint",
  );
});
