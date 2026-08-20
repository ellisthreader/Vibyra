// `npm run app:dev` on any host. The Linux dev shell needs the pkg-config
// shim from scripts/make-devshim.sh on its search path; Windows and macOS
// need nothing, and the old shell-prefix form of this script could not run
// there at all.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const env = { ...process.env };

if (process.platform === "linux") {
  const shim = join(homedir(), ".cache", "vibyra-devshim", "lib", "pkgconfig");
  if (existsSync(shim)) {
    env.PKG_CONFIG_PATH = env.PKG_CONFIG_PATH ? `${shim}:${env.PKG_CONFIG_PATH}` : shim;
  }
}

const child = spawn("npm", ["exec", "--", "tauri", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
