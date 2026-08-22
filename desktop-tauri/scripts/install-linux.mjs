// Builds the AppImage and installs it as the file the desktop launcher runs.
//
// This step used to be manual, and skipping it is invisible: the app still
// starts, still looks right, and still writes its own settings file — it just
// has the feature set of whenever it was last copied. A whole afternoon of
// work can land in the repo, pass every gate, and be entirely absent from the
// app on the dock. `npm run app:build` therefore ends here by default.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { toolchainEnv } from "./linux-env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINATION = process.env.VIBYRA_APPIMAGE_PATH || join(homedir(), "Vibyra.AppImage");
const skipBuild = process.argv.includes("--no-build");

function fail(message) {
  console.error(`\n  install failed: ${message}\n`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: ROOT, ...options });
  if (result.status !== 0) fail(`${command} ${args.join(" ")} exited ${result.status ?? "on a signal"}`);
}

/** Cargo owns where it writes; `.cargo/config.toml` can move it anywhere. */
function targetDirectory() {
  const result = spawnSync(
    "cargo",
    ["metadata", "--manifest-path", "src-tauri/Cargo.toml", "--format-version", "1", "--no-deps"],
    { cwd: ROOT, encoding: "utf8", env: toolchainEnv() },
  );
  if (result.status !== 0) fail("could not read cargo metadata");
  return JSON.parse(result.stdout).target_directory;
}

/** Newest bundle wins: `tauri build` leaves older versions in place. */
function newestAppImage(directory) {
  if (!existsSync(directory)) fail(`no bundle directory at ${directory} — run the build first`);
  const bundles = readdirSync(directory)
    .filter((name) => name.endsWith(".AppImage"))
    .map((name) => join(directory, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (bundles.length === 0) fail(`no .AppImage in ${directory} — run the build first`);
  return bundles[0];
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * linuxdeploy re-run over an AppDir it already populated short-circuits: it
 * logs "Existing AppRun detected, skipping deployment", deploys only part of
 * the runtime, and still exits 0. The result is a ~10 MB AppImage carrying the
 * binary and nothing else, which starts on a machine that happens to have GTK
 * and WebKit and is broken everywhere else. Always build the AppDir fresh.
 */
function clearAppDir(bundleDir) {
  for (const entry of existsSync(bundleDir) ? readdirSync(bundleDir) : []) {
    if (entry.endsWith(".AppDir")) rmSync(join(bundleDir, entry), { recursive: true, force: true });
  }
}

/**
 * Proves the runtime is inside the bundle rather than trusting that the
 * bundler said so. Extracting one library is cheap, and catches exactly the
 * failure above — which no exit code reports.
 */
function assertRuntimeBundled(appimage) {
  const scratch = mkdtempSync(join(tmpdir(), "vibyra-verify-"));
  try {
    spawnSync(appimage, ["--appimage-extract", "usr/lib/libwebkit2gtk*"], {
      cwd: scratch,
      stdio: "ignore",
    });
    const deployed = join(scratch, "squashfs-root", "usr", "lib");
    if (!existsSync(deployed) || readdirSync(deployed).length === 0) {
      fail(`${appimage} has no bundled WebKit — the AppImage is incomplete, refusing to install it`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.platform !== "linux") fail("this installer is Linux-only");

const bundleDir = join(targetDirectory(), "release", "bundle", "appimage");

/**
 * Updater artifacts need the release private key, which is deliberately not on
 * this machine — CI holds it as a secret and `tests/updater_signing.rs` proves
 * the shipped public key against a pre-signed fixture instead.
 *
 * Without that key `tauri build` fails *after* producing a perfectly good
 * AppImage ("a public key has been found, but no private key"), so the install
 * never ran and a whole build looked like a failure. A local install does not
 * self-update, so it does not need the signed artifacts: this turns them off
 * for this build only. A machine that does have the key signs as before, and
 * `tauri.conf.json` is untouched so releases keep signing.
 */
function buildArgs() {
  if (process.env.TAURI_SIGNING_PRIVATE_KEY) return [];
  console.log(
    "\n  no TAURI_SIGNING_PRIVATE_KEY — building without updater artifacts (local installs do not self-update)",
  );
  return ["--", "--config", JSON.stringify({ bundle: { createUpdaterArtifacts: false } })];
}

if (!skipBuild) {
  clearAppDir(bundleDir);
  run("npm", ["run", "app:build:linux", ...buildArgs()], { env: toolchainEnv() });
}

const source = newestAppImage(bundleDir);
assertRuntimeBundled(source);
const version = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8")).version;

// Replaced by rename so the swap is atomic: a running instance keeps the inode
// it already mounted and a half-copied file is never executable.
const staging = `${DESTINATION}.installing`;
copyFileSync(source, staging);
chmodSync(staging, 0o755);
renameSync(staging, DESTINATION);

const running = spawnSync("pgrep", ["-x", "Vibyra"], { encoding: "utf8" }).status === 0;

console.log(`
  installed Vibyra ${version}
    from  ${source}
    to    ${DESTINATION}
    size  ${(statSync(DESTINATION).size / 1024 / 1024).toFixed(1)} MB
    sha   ${sha256(DESTINATION)}
${running ? "\n  Vibyra is running — quit and reopen it to pick this build up.\n" : ""}`);
