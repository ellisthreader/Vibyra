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
  assert.match(workflow, /Vibyra-Desktop-0\.1\.0-beta\.1/);
  assert.doesNotMatch(workflow, /electron-builder|desktop:package/);
});
