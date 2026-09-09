// One place that answers "what does Performance mode actually change?".
//
// Every consumer reads a function from here rather than testing the boolean
// itself, so the answer stays in one file and the Settings card can describe
// the mode without drifting from what the runtime does.
//
// Deliberately NOT the same axis as `rendererMode`: that picks a Linux
// compositing path and needs a restart. This is cross-platform, applies
// instantly, and never changes which pixels are correct — only how much work
// the app does to draw them.

/** Set on `<html>` so CSS can switch without a re-render. Kept in step with
 * `styles/performance.css` by `tests/performanceMode.test.mjs`. */
const PERFORMANCE_ATTRIBUTE = "performance";

/** The activity ticker's normal cadence, from `useActivityTicker`. */
export const ACTIVITY_TICK_MS = 1_500;
/** Slower, but still under `activity.ts`'s 5s working window, so a pane's
 * working/idle state cannot flicker or be missed — only reported later. */
export const ACTIVITY_TICK_MS_FAST = 3_000;

/**
 * The perf watchdog costs the very thing it measures: a 1Hz timer that keeps
 * the main thread from ever idling, plus a native process sample every 15s
 * that walks the whole process table once a threshold is crossed. Its only
 * output is advice to do what this mode has already done, so in Performance
 * mode it stops entirely rather than sampling more slowly.
 */
export function perfWatchEnabled(performanceMode: boolean): boolean {
  return !performanceMode;
}

/** Milliseconds between activity ticks. */
export function activityTickMs(performanceMode: boolean): number {
  return performanceMode ? ACTIVITY_TICK_MS_FAST : ACTIVITY_TICK_MS;
}

/**
 * Warming the screenshot-editor chunk shortly after launch trades a module
 * parse for a faster first hotkey press. Performance mode takes the other
 * side of that trade: nothing is parsed until the editor is actually opened.
 */
export function startupPrefetchEnabled(performanceMode: boolean): boolean {
  return !performanceMode;
}

/**
 * Whether terminal output slows while the window is off screen. Keyed off
 * `document.hidden`, never focus: a visible-but-unfocused window is still
 * being watched. See `useBackgroundThrottle.ts`.
 */
export function backgroundThrottleEnabled(performanceMode: boolean): boolean {
  return performanceMode;
}

/**
 * Publishes the mode to CSS. Called on settings load and on every change, so
 * the switch is instant — there is no restart and no reload.
 */
export function applyPerformanceMode(performanceMode: boolean): void {
  const root = document.documentElement;
  if (performanceMode) {
    root.dataset[PERFORMANCE_ATTRIBUTE] = "on";
  } else {
    delete root.dataset[PERFORMANCE_ATTRIBUTE];
  }
}
