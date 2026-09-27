import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { toolchainEnv } from "./linux-env.mjs";

export function linuxBundleDirectory(root) {
  const result = spawnSync("cargo", [
    "metadata", "--manifest-path", "src-tauri/Cargo.toml", "--format-version", "1", "--no-deps",
  ], { cwd: root, encoding: "utf8", env: toolchainEnv() });
  if (result.status !== 0) throw new Error(result.stderr || "Could not read Cargo's bundle directory.");
  const target = process.env.CARGO_BUILD_TARGET;
  return join(JSON.parse(result.stdout).target_directory, ...(target ? [target] : []), "release", "bundle", "appimage");
}

export function currentAppImage(directory, config, architecture = process.arch) {
  const arch = { x64: "amd64", arm64: "aarch64", arm: "armhf", ia32: "i386" }[architecture];
  if (!arch) throw new Error(`Unsupported AppImage architecture: ${architecture}`);
  const expected = join(directory, `${config.productName}_${config.version}_${arch}.AppImage`);
  if (!existsSync(expected)) throw new Error(`Missing current ${architecture} bundle: ${expected}. Rebuild first.`);
  return expected;
}

// linuxdeploy can silently skip deployment when an old AppDir remains. Only
// remove its generated staging directories, never a previously built AppImage.
export function clearAppDirs(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.endsWith(".AppDir")) {
      rmSync(join(directory, entry.name), { recursive: true, force: true });
    }
  }
}

function filesBelow(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${prefix}${entry.name}`;
    return entry.isDirectory() ? filesBelow(join(directory, entry.name), `${path}/`) : [path];
  });
}

export function assertExtractedRuntime(directory, binaryName = "Vibyra") {
  const files = filesBelow(directory);
  const required = [
    ["native application", (path) => path === `usr/bin/${binaryName}`],
    ["WebKitGTK", (path) => /\/libwebkit2gtk-4\.1\.so(?:\.|$)/.test(path)],
    ["JavaScriptCore", (path) => /\/libjavascriptcoregtk-4\.1\.so(?:\.|$)/.test(path)],
    ["WebKit web process", (path) => path.endsWith("/WebKitWebProcess")],
    ["WebKit network process", (path) => path.endsWith("/WebKitNetworkProcess")],
    ["GStreamer media plugins", (path) => /\/gstreamer-1\.0\/libgstcoreelements\.so$/.test(path)],
  ];
  const missing = required.filter(([, matches]) => !files.some(matches)).map(([name]) => name);
  if (missing.length) throw new Error(`Incomplete AppImage runtime: missing ${missing.join(", ")}.`);
  const header = readFileSync(join(directory, "usr/bin", binaryName)).subarray(0, 4);
  if (!header.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) throw new Error("The bundled application is not a Linux ELF binary.");
}

export function assertRuntimeBundled(appimage, binaryName = "Vibyra") {
  const scratch = mkdtempSync(join(tmpdir(), "vibyra-appimage-verify-"));
  try {
    const result = spawnSync(appimage, ["--appimage-extract"], { cwd: scratch, stdio: "ignore" });
    if (result.status !== 0) throw new Error(`AppImage extraction failed (${result.status ?? result.error?.message}).`);
    assertExtractedRuntime(join(scratch, "squashfs-root"), binaryName);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
