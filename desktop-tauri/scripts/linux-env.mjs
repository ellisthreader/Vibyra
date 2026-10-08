import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const SHIM = join(homedir(), ".cache", "vibyra-devshim", "lib", "pkgconfig");

/** What the Tauri shell needs pkg-config to resolve before cargo can link it. */
const REQUIRED = ["gtk+-3.0", "webkit2gtk-4.1", "javascriptcoregtk-4.1", "libsoup-3.0"];

function systemResolvesEverything(env) {
  return spawnSync("pkg-config", ["--exists", ...REQUIRED], { env, stdio: "ignore" }).status === 0;
}

/**
 * The environment cargo and the bundler need to build the Tauri shell.
 *
 * `make-devshim.sh` writes stub `.pc` files pointing at the system GTK/WebKit
 * *runtime* libraries, for a machine that has them but not their `-dev`
 * metadata. The stubs carry only what cargo needs to link — no `exec_prefix`,
 * no `gtk_binary_version`.
 *
 * That makes the shim actively harmful once the real `-dev` packages are
 * installed: `PKG_CONFIG_PATH` is searched *before* the system directories, so
 * the stub shadows the complete file, and linuxdeploy's GTK plugin fails the
 * AppImage bundle with "there is no 'exec_prefix' variable for 'gtk+-3.0'"
 * long after cargo has succeeded. The shim is therefore a fallback, applied
 * only when the system genuinely cannot resolve these itself — and stripped
 * from an inherited `PKG_CONFIG_PATH` first, so an exported value from the
 * calling shell cannot reintroduce it.
 */
export function toolchainEnv() {
  const env = { ...process.env };
  if (process.platform !== "linux") return env;

  const inherited = (env.PKG_CONFIG_PATH ?? "")
    .split(":")
    .filter((entry) => entry && entry !== SHIM)
    .join(":");
  if (inherited) env.PKG_CONFIG_PATH = inherited;
  else delete env.PKG_CONFIG_PATH;

  if (systemResolvesEverything(env) || !existsSync(SHIM)) return env;
  env.PKG_CONFIG_PATH = inherited ? `${SHIM}:${inherited}` : SHIM;
  return env;
}
