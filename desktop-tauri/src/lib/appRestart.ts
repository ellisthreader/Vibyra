import { relaunch } from "@tauri-apps/plugin-process";

import { saveSessionNow } from "./sessionPersistence";

/** Restarts Vibyra the safe way. `relaunch()` exits without raising the close
 * event the guard listens for, so the session flush that normally happens on
 * close has to happen here first — the same contract the updater's restart
 * follows in `updateStore.ts`. */
export async function restartAppNow(): Promise<void> {
  await saveSessionNow(true).catch(() => {});
  await relaunch();
}
