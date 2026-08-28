import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

import type { DownloadEvent } from "../lib/updatePolicy";

export type { Update };

/** Asks the release feed whether a newer build exists for this exact bundle
 * (AppImage, deb or NSIS — the bundler stamps which into the binary). Resolves
 * to `null` when the server answers 204, which is the common case.
 *
 * The request is made by the Rust plugin over reqwest, not by the webview, so
 * the window CSP never enters into it. */
export function checkForUpdate(timeoutMs = 30_000): Promise<Update | null> {
  return check({ timeout: timeoutMs });
}

/** Fetches the package but stops short of touching the installed app, so the
 * user still chooses when to restart — this app holds live terminal sessions. */
export function downloadUpdate(
  update: Update,
  onEvent: (event: DownloadEvent) => void,
): Promise<void> {
  return update.download(onEvent);
}

/** Swaps the installed app for the downloaded package, then restarts.
 *
 * On Windows `install()` hands off to the NSIS installer and exits this
 * process, so `relaunch()` is only ever reached on Linux and macOS. */
export async function installUpdate(update: Update): Promise<void> {
  await update.install();
  await relaunch();
}
