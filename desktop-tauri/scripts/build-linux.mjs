// The release and local installer must use the same bundling safeguards.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertRuntimeBundled, clearAppDirs, currentAppImage, linuxBundleDirectory } from "./linux-appimage.mjs";
import { toolchainEnv } from "./linux-env.mjs";

if (process.platform !== "linux") throw new Error("Build the Linux AppImage on Linux; use the Linux CI runner from macOS.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.some((value) => /^(--target(?:=|$)|--debug$|--no-bundle$)/.test(value))) {
  throw new Error("This command verifies the native release AppImage. Build it on a runner matching the target architecture.");
}
if (process.env.CARGO_BUILD_TARGET) {
  throw new Error("Unset CARGO_BUILD_TARGET; AppImage bundling requires a native Linux runner.");
}
const bundle = linuxBundleDirectory(root);
clearAppDirs(bundle);
const result = spawnSync("npm", ["exec", "--", "tauri", "build", ...args], {
  cwd: root, env: toolchainEnv(), stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);
const config = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
const appimage = currentAppImage(bundle, config);
assertRuntimeBundled(appimage, config.mainBinaryName);
console.log(`Verified current Linux bundle and embedded WebKit/media runtime: ${appimage}`);
