import { useEffect } from "react";

import { perfSample, type PerfSample } from "../ipc/perf";
import { rendererPolicy } from "../ipc/render";
import { useNotificationStore } from "../state/notificationStore";
import { useSettingsStore } from "../state/settingsStore";
import { useTerminalStore } from "../state/terminalStore";
import { initialGuardState, nextGuardState } from "./perfGuard";
import { judge, type PerfWindow } from "./perfPolicy";
import { startDriftSampler } from "./perfSampler";
import { announceRendererHeal } from "./rendererHealNotice";
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
 * The 1 Hz drift tick is the primary signal and always runs; the native sample
 * is polled on demand — and only while the user is here or an agent is
 * streaming — so a backgrounded window costs nothing.
 */
export function usePerfWatch(): void {
  useEffect(() => {
    const startedAt = Date.now();
    let guard = initialGuardState();
    let native: PerfSample | null = null;
    let compositing = false;
    let nvidiaSession = false;
    let graphicsSwitchAvailable = false;
    let lastNativeAt = 0;
    let stopped = false;

    // Resolved once: the compositing path is fixed for the life of the webview,
    // and it decides whether a stall gets the actionable "compatibility mode"
    // message or the generic one.
    void rendererPolicy()
      .then((policy) => {
        compositing = policy.softwareCompositing;
        nvidiaSession = policy.nvidiaSession;
        graphicsSwitchAvailable = policy.configurable && !policy.environmentOverride;
        announceRendererHeal(policy);
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

      const rendererMode = useSettingsStore.getState().settings?.rendererMode;
      const window: PerfWindow = {
        lagMs,
        cpuPercent: native?.cpuPercent ?? null,
        appCpuPercent: native?.appCpuPercent ?? null,
        rendererCpuPercent: native?.rendererCpuPercent ?? null,
        memRatio: memoryRatio(native),
        softwareCompositing: compositing,
        autoGraphics: rendererMode === "auto",
        acceleratedGraphics: rendererMode === "accelerated",
        nvidiaSession,
        graphicsSwitchAvailable,
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
  }, []);
}
