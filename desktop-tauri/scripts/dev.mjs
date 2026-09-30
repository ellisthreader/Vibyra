// `npm run app:dev` on any host. The toolchain environment is shared with the
// installer so the two can never disagree about how this machine builds; the
// old shell-prefix form of this script could not run on Windows at all.
import { spawn } from "node:child_process";
import { connect } from "node:net";
import process from "node:process";

import { toolchainEnv } from "./linux-env.mjs";

const env = toolchainEnv();

function portInUse() {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: 1420 });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.setTimeout(1_000, () => { socket.destroy(); resolve(false); });
  });
}

async function vibyraViteIsReady() {
  try {
    const response = await fetch("http://127.0.0.1:1420/", { signal: AbortSignal.timeout(1_000) });
    const html = await response.text();
    return response.ok && html.includes("<title>Vibyra Desktop</title>") && html.includes("/@vite/client");
  } catch { return false; }
}

const occupied = await portInUse();
if (occupied && !await vibyraViteIsReady()) {
  console.error("Port 1420 belongs to another service. Stop that service before starting Vibyra Desktop.");
  process.exit(1);
}
if (occupied) console.log("Reusing the Vibyra Vite server already running on port 1420.");
const reuseServer = occupied ? ["--config", JSON.stringify({ build: { beforeDevCommand: "" } })] : [];

const child = spawn("npm", ["exec", "--", "tauri", "dev", ...reuseServer, ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
