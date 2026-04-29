import { exec } from "node:child_process";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { PORT } from "./state.mjs";

export function openDesktopWindow() {
  const url = `http://127.0.0.1:${PORT}/desktop`;
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
