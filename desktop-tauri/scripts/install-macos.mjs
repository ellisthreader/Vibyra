import { localSigningIdentity, verifyMacSignature } from "./macos-signing.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Explicit update mode: atomically replace the bundle on disk, keeping the old
// bundle and every running process alive. Never launch a second app over its journals.
const keepRunning = process.argv.includes("--keep-running");
let restartPending = false;
const destination = resolve(process.env.VIBYRA_MAC_APP_PATH || "/Applications/Vibyra.app");

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", stdio: capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed (${result.status})`);
  return result.stdout?.trim();
}

function assertNotRunning() {
  // pgrep excludes ancestor processes on macOS. The app can host the very
  // terminal running this installer, so inspect the full process table.
  const commands = run("ps", ["-axww", "-o", "comm="], true).split("\n");
  if (commands.some((command) => command.trim().endsWith("/Contents/MacOS/Vibyra"))) {
    if (!keepRunning) throw new Error("Quit Vibyra before installing, then run npm run app:install:only. Your terminals have not been closed.");
    restartPending = true;
  }
}

if (process.platform !== "darwin") throw new Error("This installer requires macOS.");
if (!destination.endsWith(".app")) throw new Error("VIBYRA_MAC_APP_PATH must end in .app.");

if (!process.argv.includes("--no-build")) {
  if (!process.env.APPLE_SIGNING_IDENTITY && !process.argv.includes("--allow-ad-hoc")) {
    process.env.APPLE_SIGNING_IDENTITY = localSigningIdentity();
  }
  const args = ["run", "app:build:macos"];
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    args.push("--", "--config", JSON.stringify({ bundle: { createUpdaterArtifacts: false } }));
  }
  run("npm", args);
}

const metadata = JSON.parse(run("cargo", [
  "metadata", "--manifest-path", "src-tauri/Cargo.toml", "--format-version", "1", "--no-deps",
], true));
const source = join(metadata.target_directory, "release", "bundle", "macos", "Vibyra.app");
const executable = "Contents/MacOS/Vibyra";
if (!existsSync(join(source, executable))) throw new Error(`Missing Mac bundle: ${source}`);
const version = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")).version;
const bundledVersion = run("/usr/libexec/PlistBuddy", [
  "-c", "Print :CFBundleShortVersionString", join(source, "Contents/Info.plist"),
], true);
if (version !== bundledVersion) throw new Error("The Mac bundle version is stale; rebuild first.");
const buildNumber = JSON.parse(readFileSync(join(root, "src-tauri/tauri.macos.conf.json"), "utf8")).bundle.macOS.bundleVersion;
const bundledBuild = run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleVersion", join(source, "Contents/Info.plist")], true);
if (buildNumber !== bundledBuild) throw new Error("The Mac bundle build number is stale; rebuild first.");
if (process.argv.includes("--build-only")) {
  console.log(`Built Vibyra ${version}: ${source}`);
  process.exit(0);
}

assertNotRunning();
const stagingRoot = mkdtempSync(join(dirname(destination), ".vibyra-install-"));
const staged = join(stagingRoot, "Vibyra.app");
const backup = `${destination}.previous-${Date.now()}`;
let backedUp = false;
try {
  run("ditto", [source, staged]);
  // Preserve the bundle's original signature; re-signing here can destroy a
  // valid Developer ID signature when --no-build runs without signing env vars.
  verifyMacSignature(staged, {
    allowAdHoc: process.argv.includes("--allow-ad-hoc"),
    previous: existsSync(destination) ? destination : undefined,
  });
  const hash = (path) => createHash("sha256").update(readFileSync(join(path, executable))).digest("hex");
  // Signing changes Mach-O bytes, so verify the installed executable against staging.
  const expectedHash = hash(staged);
  assertNotRunning();
  if (existsSync(destination)) {
    renameSync(destination, backup);
    backedUp = true;
  }
  try {
    renameSync(staged, destination);
  } catch (error) {
    if (backedUp) renameSync(backup, destination);
    throw error;
  }
  if (hash(destination) !== expectedHash) throw new Error("Installed executable checksum mismatch.");
  console.log(`Installed Vibyra ${version} (build ${bundledBuild}) at ${destination}\nSHA256 ${expectedHash}`);
  if (backedUp) console.log(`Previous app retained at ${backup}`);
  if (restartPending) console.log("The running workspace was left untouched. The installed update takes effect after Save and quit, then reopening Vibyra.");
} finally {
  rmSync(stagingRoot, { recursive: true, force: true });
}
