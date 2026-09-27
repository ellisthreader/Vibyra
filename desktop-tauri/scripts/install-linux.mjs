// Build and atomically replace the current native AppImage without stopping
// the user's workspace. A later launch picks up the installed build.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertRuntimeBundled, currentAppImage, linuxBundleDirectory } from "./linux-appimage.mjs";
import { installLinuxLauncher } from "./linux-launcher.mjs";
import { toolchainEnv } from "./linux-env.mjs";

if (process.platform !== "linux") throw new Error("This installer requires Linux.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(process.env.VIBYRA_APPIMAGE_PATH || join(homedir(), "Vibyra.AppImage"));
if (!destination.endsWith(".AppImage")) throw new Error("VIBYRA_APPIMAGE_PATH must end in .AppImage.");

if (!process.argv.includes("--no-build")) {
  const args = ["run", "app:build:linux"];
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    console.log("Building locally without updater signatures; release builds keep signing enabled.");
    args.push("--", "--config", JSON.stringify({ bundle: { createUpdaterArtifacts: false } }));
  }
  const result = spawnSync("npm", args, { cwd: root, stdio: "inherit", env: toolchainEnv() });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const config = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
const source = currentAppImage(linuxBundleDirectory(root), config);
assertRuntimeBundled(source, config.mainBinaryName);
if (process.argv.includes("--build-only")) {
  console.log(`Built Vibyra ${config.version}: ${source}`);
  process.exit(0);
}

mkdirSync(dirname(destination), { recursive: true });
const stagingRoot = mkdtempSync(join(dirname(destination), ".vibyra-install-"));
const staged = join(stagingRoot, "Vibyra.AppImage");
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
try {
  const expected = sha256(source);
  copyFileSync(source, staged);
  chmodSync(staged, 0o755);
  if (sha256(staged) !== expected) throw new Error("Staged AppImage checksum mismatch.");
  renameSync(staged, destination);
  if (sha256(destination) !== expected) throw new Error("Installed AppImage checksum mismatch.");
  const launcher = installLinuxLauncher({ root, destination });
  console.log(`Installed Vibyra ${config.version}\n  app: ${destination}\n  launcher: ${launcher}\n  size: ${(statSync(destination).size / 1024 / 1024).toFixed(1)} MB\n  sha256: ${expected}`);
  if (spawnSync("pgrep", ["-x", "Vibyra"], { stdio: "ignore" }).status === 0) {
    console.log("Vibyra is running. Save and quit, then reopen it to use this build.");
  }
} finally {
  rmSync(stagingRoot, { recursive: true, force: true });
}
