import { exec, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PORT } from "./state.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(moduleDir, "../..");
const electronEntrypoint = join(repoRoot, "desktop/electron-main.cjs");
const electronCandidates = [
  join(repoRoot, "node_modules/.bin/electron"),
  join(repoRoot, "../codingterminal/node_modules/.bin/electron")
];

export function openDesktopWindow() {
  const url = `http://127.0.0.1:${PORT}/desktop`;
  const electron = electronCandidates.find((candidate) => existsSync(candidate));
  if (electron && existsSync(electronEntrypoint)) {
    const electronEnv = { ...process.env, VIBYRA_DESKTOP_URL: url };
    delete electronEnv.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, ["--no-sandbox", "--disable-gpu", "--disable-gpu-compositing", electronEntrypoint], {
      detached: true,
      env: electronEnv,
      stdio: ["ignore", "ignore", "inherit"]
    });
    child.on("error", (error) => {
      console.error(`Could not open Vibyra Desktop window: ${error.message}`);
    });
    child.unref();
    return;
  }
  const userDataDir = join(homedir(), ".vibyra-desktop-window");
  const linuxAppWindow =
    `google-chrome --app="${url}" --class=VibyraDesktop ` +
    `--user-data-dir="${userDataDir}" --window-size=940,760`;
  const opener = platform() === "darwin"
    ? `open -na "Google Chrome" --args --app="${url}" --window-size=940,760`
    : platform() === "win32"
      ? `start "" chrome --app="${url}" --window-size=940,760`
      : `${linuxAppWindow} || chromium --app="${url}" --class=VibyraDesktop --window-size=940,760 || xdg-open "${url}"`;
  exec(opener);
}
