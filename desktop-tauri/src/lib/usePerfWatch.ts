import { useEffect } from "react";

import { perfSample, type PerfSample } from "../ipc/perf";
import { rendererPolicy } from "../ipc/render";
import { useNotificationStore } from "../state/notificationStore";
import { useSettingsStore } from "../state/settingsStore";
import { useTerminalStore } from "../state/terminalStore";
import { initialGuardState, nextGuardState } from "./perfGuard";
import { judge, type PerfWindow } from "./perfPolicy";
import { perfWatchEnabled } from "./performanceMode";
import { startDriftSampler } from "./perfSampler";
import { windowIsFocused } from "./windowFocus";

/** Native readings are expensive relative to the drift tick, and the machine
 * does not change character in under a quarter of a minute. */
const NATIVE_SAMPLE_MS = 15_000;

function memoryRatio(sample: PerfSample | null): number | null {
  if (!sample || sample.memTotalBytes <= 0) return null;
  return sample.memUsedBytes / sample.memTotalBytes;
}

function workingPaneCount(): number {
  const { panes, activity } = useTerminalStore.getState();
  return panes.filter((pane) => activity[pane.id] === "working").length;
}

/**
 * Watches for the machine getting into trouble and says so at most a few times
 * a session.
 *
 * The 1 Hz drift tick is the primary signal; the native sample is polled on
 * demand — and only while the user is here or an agent is streaming — so a
 * backgrounded window costs nothing.
 *
 * The whole watch is off in Performance mode. Its advice is "turn things off
 * to go faster", which that mode has already done, and the 1 Hz timer alone
 * would keep the main thread from ever settling. See `performanceMode.ts`.
 */
export function usePerfWatch(): void {
  const enabled = perfWatchEnabled(
    useSettingsStore((state) => state.settings?.performanceMode ?? false),
  );
  useEffect(() => {
    if (!enabled) return;
    const startedAt = Date.now();
    let guard = initialGuardState();
    let native: PerfSample | null = null;
    let compositing = false;
    let lastNativeAt = 0;
    let stopped = false;

    // Resolved once: the compositing path is fixed for the life of the webview,
    // and it decides whether a stall gets the actionable "compatibility mode"
    // message or the generic one.
    void rendererPolicy()
      .then((policy) => {
        compositing = policy.softwareCompositing;
      })
      .catch(() => {});

    const stop = startDriftSampler(({ lagMs }) => {
      const now = Date.now();
      const focused = windowIsFocused();
      const workingPanes = workingPaneCount();

      if (now - lastNativeAt >= NATIVE_SAMPLE_MS && (focused || workingPanes > 0)) {
        lastNativeAt = now;
        void perfSample()
          .then((sample) => {
            if (!stopped) native = sample;
          })
          .catch(() => {
            native = null;
          });
      }

      const window: PerfWindow = {
        lagMs,
        cpuPercent: native?.cpuPercent ?? null,
        appCpuPercent: native?.appCpuPercent ?? null,
        memRatio: memoryRatio(native),
        softwareCompositing: compositing,
        workingPanes,
      };
      const result = nextGuardState(guard, judge(window), now, {
        uptimeMs: now - startedAt,
        away: !focused,
        window,
      });
      guard = result.state;
      if (result.notify) useNotificationStore.getState().push(result.notify);
    });

    return () => {
      stopped = true;
      stop();
    };
  }, [enabled]);
}
