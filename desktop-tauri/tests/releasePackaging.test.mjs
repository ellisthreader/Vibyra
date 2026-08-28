import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  readDesktopVersion,
  smokeUpdateFeeds,
  verifyArtifact,
} from "../scripts/verify-release.mjs";

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

test("desktop release workflow builds and smoke-tests every public beta package", () => {
  const workflow = readFileSync(
    resolve(repo, ".github/workflows/desktop-release.yml"),
    "utf8",
  );

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /ubuntu-22\.04/);
  assert.match(workflow, /app:build:windows/);
  assert.match(workflow, /app:build:linux/);
  assert.match(workflow, /app:build:deb/);
  assert.match(workflow, /Smoke-test Linux AppImage launch/);
  assert.match(workflow, /Smoke-test Debian package install and app launch/);
  assert.match(workflow, /Smoke-test Windows installer and app launch/);
  assert.doesNotMatch(workflow, /electron-builder|desktop:package/);

  // Artifacts are named from tauri.conf.json, not a frozen literal — every
  // build used to be stamped 0.1.0-beta.1 whatever it actually was.
  assert.match(workflow, /verify-release\.mjs version/);
  assert.doesNotMatch(workflow, /Vibyra-Desktop-0\.1\.0-beta\.1/);

  // An unsigned build cannot be offered as an in-app update, so the release
  // job must both pass the key in and fail if no .sig comes out.
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY \}\}/);
  assert.match(workflow, /test -s "\$\{matches\[0\]\}\.sig"/);
  assert.match(workflow, /verify-release\.mjs artifact/);
  assert.match(workflow, /\.metadata\.json/);

  // Publication stays manual, but the post-build job proves the complete set
  // and the read-only live feed contract before a person receives metadata.
  assert.match(workflow, /needs: package/);
  assert.match(workflow, /actions\/download-artifact@/);
  assert.match(workflow, /verify-release\.mjs set release-set/);
  assert.match(workflow, /verify-release\.mjs feed/);
  assert.match(workflow, /release-preflight:/);
  assert.match(workflow, /needs: release-preflight/);
});

test("release verification rejects version drift and corrupt package metadata", async () => {
  const packageVersion = JSON.parse(read("package.json")).version;
  const tauriVersion = JSON.parse(read("src-tauri/tauri.conf.json")).version;
  assert.equal(readDesktopVersion(), packageVersion);
  assert.equal(packageVersion, tauriVersion);

  const temp = mkdtempSync(resolve(tmpdir(), "vibyra-release-"));
  const artifact = resolve(temp, `Vibyra-Desktop-${packageVersion}-x86_64.AppImage`);
  const fixture = "src-tauri/tests/fixtures/updater-fixture.bin";
  const bytes = readFileSync(resolve(desktop, fixture));
  const digest = createHash("sha256").update(bytes).digest("hex");
  const signature = read(`${fixture}.sig`).trim();
  try {
    mkdirSync(resolve(temp, "src-tauri"));
    writeFileSync(resolve(temp, "package.json"), '{"version":"1.2.3"}');
    writeFileSync(resolve(temp, "src-tauri/tauri.conf.json"), '{"version":"1.2.4"}');
    assert.throws(() => readDesktopVersion(temp), /Version mismatch/);

    writeFileSync(artifact, bytes);
    writeFileSync(`${artifact}.sha256`, `${digest}  ${artifact}\n`);
    writeFileSync(`${artifact}.sig`, `${signature}\n`);
    const metadata = await verifyArtifact("appimage", artifact, true);
    assert.equal(metadata.sha256, digest);
    assert.equal(metadata.sizeBytes, bytes.length);

    writeFileSync(`${artifact}.sha256`, `${"0".repeat(64)}  ${artifact}\n`);
    await assert.rejects(verifyArtifact("appimage", artifact), /checksum is invalid/);

    const tampered = Buffer.concat([bytes, Buffer.from("!")]);
    const tamperedDigest = createHash("sha256").update(tampered).digest("hex");
    writeFileSync(artifact, tampered);
    writeFileSync(`${artifact}.sha256`, `${tamperedDigest}  ${artifact}\n`);
    await assert.rejects(verifyArtifact("appimage", artifact), /does not verify this artifact/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("release verification probes all updater routes without publishing", async () => {
  const calls = [];
  const signature = read("src-tauri/tests/fixtures/updater-fixture.bin.sig").trim();
  const statuses = await smokeUpdateFeeds(async (url) => {
    calls.push(url);
    if (url.endsWith("/0.0.0")) {
      return Response.json({
        version: "1.0.0",
        url: "https://downloads.example.test/Vibyra",
        signature,
        pub_date: "2026-08-28T12:00:00Z",
      });
    }
    return new Response(null, { status: 204 });
  });

  assert.deepEqual(statuses, [
    "windows:200/204/204",
    "appimage:200/204/204",
    "deb:200/204/204",
  ]);
  assert.equal(calls.length, 9);
  assert.ok(calls.some((url) => url.includes("/windows/x86_64/nsis/")));
  assert.ok(calls.some((url) => url.includes("/linux/x86_64/appimage/")));
  assert.ok(calls.some((url) => url.includes("/linux/x86_64/deb/")));
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
