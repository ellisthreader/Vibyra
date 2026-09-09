import { useEffect } from "react";

import { useNotificationPrefs, useSettingsStore } from "../state/settingsStore";
import { useTerminalStore } from "../state/terminalStore";
import { activityFor, type ActivityState } from "./activity";
import { detectTransitions, type SessionPhase } from "./activityTransitions";
import { notifyActivityTransitions } from "./notificationTriggers";
import { activityTickMs } from "./performanceMode";
import { windowIsFocused } from "./windowFocus";

/**
 * Derives coarse activity (working / idle / attention) on a slow tick so the
 * high-rate output flushes never touch React state. `applyActivity` diffs the
 * map before setting, so a quiet workspace re-renders nothing.
 *
 * Performance mode halves the rate; the cadence lives in `performanceMode.ts`
 * so the trade-off against `activity.ts`'s windows is stated in one place.
 */
export function useActivityTicker(): void {
  const idleEnabled = useNotificationPrefs().agentIdleEnabled;
  const tickMs = activityTickMs(
    useSettingsStore((state) => state.settings?.performanceMode ?? false),
  );
  useEffect(() => {
    // Phase state lives in the closure, not React: the ticker runs whether or
    // not anything re-renders, and an edge missed by a render is an edge lost.
    let phases = new Map<number, SessionPhase>();
    const timer = setInterval(() => {
      const { panes, applyActivity } = useTerminalStore.getState();
      const next: Record<number, ActivityState> = {};
      for (const pane of panes) {
        if (pane.status !== "running" || pane.visibility === "hibernated") continue;
        next[pane.id] = activityFor(pane.id);
      }
      applyActivity(next);
      const result = detectTransitions(phases, next, {
        now: Date.now(),
        focusedId: useTerminalStore.getState().focusedId,
        windowFocused: windowIsFocused(),
        idleEnabled,
      });
      phases = result.phases;
      if (result.transitions.length > 0) notifyActivityTransitions(result.transitions);
    }, tickMs);
    return () => clearInterval(timer);
  }, [idleEnabled, tickMs]);
}
