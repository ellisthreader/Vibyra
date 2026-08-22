// `npm run app:dev` on any host. The toolchain environment is shared with the
// installer so the two can never disagree about how this machine builds; the
// old shell-prefix form of this script could not run on Windows at all.
import { spawn } from "node:child_process";
import process from "node:process";

import { toolchainEnv } from "./linux-env.mjs";

const env = toolchainEnv();

const child = spawn("npm", ["exec", "--", "tauri", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
