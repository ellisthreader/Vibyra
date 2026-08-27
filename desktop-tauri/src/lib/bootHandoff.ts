import { invoke } from "@tauri-apps/api/core";

let signalled = false;

/** Tells the host the workspace has painted something worth revealing.
 *
 * Safe to call repeatedly — the first call wins here, and the host latches
 * again on its side, because the watchdog and a user-closed splash can reach
 * the same handover from the other direction. */
export function signalAppReady(): void {
  if (signalled) return;
  signalled = true;

  // Deliberately a timeout and not `requestAnimationFrame`: this window is
  // still hidden, and a hidden window's frame callbacks are throttled or
  // stopped outright, so a rAF-gated signal would never arrive and the splash
  // would sit there until the host's watchdog gave up on it. The host holds
  // the splash over the revealed window for a beat, which covers the first
  // paint this callback runs ahead of.
  setTimeout(() => {
    void invoke("boot_main_ready").catch(() => {
      // Running outside the host — `vite dev` in a plain browser. There is no
      // splash waiting on this, so there is nothing to recover from.
    });
  }, 0);
}
