import { useEffect } from "react";

import { useNotificationPrefs, useSettingsStore } from "../state/settingsStore";
import { useTerminalStore } from "../state/terminalStore";
import { activityFor, type ActivityState } from "./activity";
import { detectTransitions, type SessionPhase } from "./activityTransitions";
import { dismissSettledPrompts, notifyActivityTransitions } from "./notificationTriggers";
import { autoHibernateIdle } from "./terminalHibernate";
import { windowIsFocused } from "./windowFocus";

const ACTIVITY_TICK_MS = 1_500;

/**
 * Derives coarse activity (working / idle / attention) on a slow tick so the
 * high-rate output flushes never touch React state. `applyActivity` diffs the
 * map before setting, so a quiet workspace re-renders nothing.
 */
export function useActivityTicker(): void {
  const idleEnabled = useNotificationPrefs().agentIdleEnabled;
  const maxPerformance = useSettingsStore((s) => s.settings?.performanceMode === "max");
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
      // Before the edges, so a prompt answered in the pane loses its toast on
      // the same tick the pane stops asking.
      dismissSettledPrompts(next);
      const result = detectTransitions(phases, next, {
        now: Date.now(),
        focusedId: useTerminalStore.getState().focusedId,
        windowFocused: windowIsFocused(),
        idleEnabled,
      });
      phases = result.phases;
      if (result.transitions.length > 0) notifyActivityTransitions(result.transitions);
      // After the edges, so a pane never hibernates on the same tick a
      // notice about it is going out.
      if (maxPerformance) autoHibernateIdle(phases, Date.now());
    }, ACTIVITY_TICK_MS);
    return () => clearInterval(timer);
  }, [idleEnabled, maxPerformance]);
}
