import { useEffect } from "react";

import { setTerminalVisibility } from "../ipc/terminal";
import { useSettingsStore } from "../state/settingsStore";
import { useTerminalStore } from "../state/terminalStore";
import { panesToRestore, panesToThrottle } from "./backgroundThrottlePolicy";
import { backgroundThrottleEnabled } from "./performanceMode";

// While the window is minimised or its Space is elsewhere, a streaming agent
// still costs a full 16ms flush cadence: an IPC round trip, an ANSI parse and
// an xterm buffer write, ~60 times a second, for pixels nobody can see.
//
// `document.hidden` — not focus. A visible-but-unfocused window (Vibyra beside
// an editor, an agent watched while you work elsewhere) keeps the full rate;
// only genuinely invisible output is slowed.
//
// The mechanism is the one non-active projects already use: Rust's `Hidden`
// visibility flushes on `hidden_interval` (250ms) instead of per tick. No
// output is lost — the buffer coalesces, and an overflow resyncs the pane from
// its scrollback ring on the way back.

/**
 * Performance mode only: slows terminal output while the window is not on
 * screen, and puts it back the moment it is.
 */
export function useBackgroundThrottle(): void {
  const enabled = backgroundThrottleEnabled(
    useSettingsStore((state) => state.settings?.performanceMode ?? false),
  );

  useEffect(() => {
    if (!enabled) return;
    let demoted: number[] = [];

    const send = (ids: number[], visibility: "visible" | "hidden"): void => {
      for (const id of ids) {
        void setTerminalVisibility(id, visibility).catch(() => {});
      }
    };
    const release = (): void => {
      const ids = demoted;
      demoted = [];
      send(panesToRestore(ids, useTerminalStore.getState().panes), "visible");
    };

    const apply = (): void => {
      if (!document.hidden) {
        release();
        return;
      }
      // Already throttled: a second visibilitychange must not widen the set and
      // strand panes the user hid themselves.
      if (demoted.length > 0) return;
      demoted = panesToThrottle(useTerminalStore.getState().panes);
      send(demoted, "hidden");
    };

    document.addEventListener("visibilitychange", apply);
    // A window already hidden when the mode is switched on should throttle now,
    // not the next time someone looks at it.
    apply();

    return () => {
      document.removeEventListener("visibilitychange", apply);
      // Turning the mode off, or unmounting, must never leave a pane stuck on
      // the slow cadence with no listener left to release it.
      release();
    };
  }, [enabled]);
}
