// One place that answers "what does Performance actually change?".
//
// Three levels rather than a switch, the way a laptop offers one. They are a
// ladder: each does everything the level below it does, plus its own.
//
//   full      nothing is held back
//   balanced  stops work nobody can see; the app looks identical
//   best      also stops the interface spending on looks
//
// Every consumer reads a function from here rather than comparing the level
// itself, so the answer lives in one file and the Settings copy cannot drift
// from what the runtime does.
//
// Deliberately NOT the same axis as `rendererMode`. That one picks a Linux
// WebKit compositing path, is read before the webview exists, needs a restart,
// and decides whether xterm gets the WebGL renderer. Nothing in this file may
// ever touch it, at any level. Terminal panes once rendered black for exactly
// that reason — WebGL that loads but never composites — and the fix was to let
// Rust own that decision by itself. On macOS the WebGL renderer is the *fast*
// path, so "saving work" by dropping it would cost performance, not save it.
// `tests/performanceMode.test.mjs` fails if the two axes are ever wired
// together. See "Tauri Terminal Performance Overhaul" in the vault.

export type PerformanceMode = "full" | "balanced" | "best";

/** Lowest to highest; the order *is* the ladder that `atLeast` walks. */
export const PERFORMANCE_MODES: readonly PerformanceMode[] = ["full", "balanced", "best"];

/** Balanced rather than Full: at this level nothing on screen changes, so the
 * saving is free. A Mac that has never touched the setting lands here. */
export const DEFAULT_PERFORMANCE_MODE: PerformanceMode = "balanced";

/** Set on `<html>` so CSS can switch without a re-render. Kept in step with
 * `styles/performance.css` by `tests/performanceMode.test.mjs`. */
const PERFORMANCE_ATTRIBUTE = "performance";

/** True once `mode` has climbed to at least `floor`. */
function atLeast(mode: PerformanceMode, floor: PerformanceMode): boolean {
  return PERFORMANCE_MODES.indexOf(mode) >= PERFORMANCE_MODES.indexOf(floor);
}

/**
 * Accepts anything a settings.json can hold, including the boolean this
 * setting used to be.
 *
 * `true` meant every saving at once, which is now `best`. `false` was only
 * ever the old default — nobody chose it — so it lands on the new default
 * rather than on `full`, which is safe because Balanced changes nothing the
 * user can see. Rust normalizes the same way; see `core/performance.rs`.
 */
export function normalizePerformanceMode(value: unknown): PerformanceMode {
  if (value === true) return "best";
  return PERFORMANCE_MODES.includes(value as PerformanceMode)
    ? (value as PerformanceMode)
    : DEFAULT_PERFORMANCE_MODE;
}

/** The activity ticker's normal cadence, from `useActivityTicker`. */
export const ACTIVITY_TICK_MS = 1_500;
/** Slower, but still under `activity.ts`'s 5s working window, so a pane's
 * working/idle state cannot flicker or be missed — only reported later. */
export const ACTIVITY_TICK_MS_SLOW = 3_000;

/**
 * The perf watchdog costs the very thing it measures: a 1Hz timer that keeps
 * the main thread from ever idling, plus a native process sample every 15s
 * that walks the whole process table once a threshold is crossed.
 *
 * It survives Balanced on purpose — its advice is how most people find this
 * setting at all. Best performance has already taken that advice, so there it
 * stops entirely rather than sampling more slowly.
 */
export function perfWatchEnabled(mode: PerformanceMode): boolean {
  return !atLeast(mode, "best");
}

/**
 * Milliseconds between activity ticks. Slower only at Best performance: the
 * tick drives the visible working/idle dot on every pane, so Balanced — which
 * promises nothing on screen changes — has to keep it exact.
 */
export function activityTickMs(mode: PerformanceMode): number {
  return atLeast(mode, "best") ? ACTIVITY_TICK_MS_SLOW : ACTIVITY_TICK_MS;
}

/**
 * Warming the screenshot-editor chunk shortly after launch trades a module
 * parse for a faster first hotkey press. From Balanced up nothing is parsed
 * until the editor is actually opened — invisible until that first press, and
 * only once, which is why it starts at Balanced rather than the top.
 */
export function startupPrefetchEnabled(mode: PerformanceMode): boolean {
  return !atLeast(mode, "balanced");
}

/**
 * Whether terminal output slows while the window is off screen. This is what
 * Balanced is for: a streaming agent behind a minimised window costs an IPC
 * round trip, an ANSI parse and a buffer write ~60 times a second, for pixels
 * nobody can see. Nothing is lost — the buffer coalesces and an overflow
 * resyncs from the scrollback ring.
 *
 * Keyed off `document.hidden`, never focus. See `useBackgroundThrottle.ts`.
 */
export function backgroundThrottleEnabled(mode: PerformanceMode): boolean {
  return atLeast(mode, "balanced");
}

/**
 * Whether the chrome drops decorative motion, blur and layered shadow. The
 * only level that changes how the app looks, which is exactly why it is the
 * top one and never reached by accident. The paint half lives in
 * `styles/performance.css`.
 */
export function leanChromeEnabled(mode: PerformanceMode): boolean {
  return atLeast(mode, "best");
}

/**
 * Publishes the level to CSS. Called on settings load and on every change, so
 * switching level is instant — there is no restart and no reload.
 *
 * `full` carries no attribute at all, so the base sheets stand as the design
 * drew them. The other two name themselves; only the level that changes
 * appearance is styled.
 */
export function applyPerformanceMode(mode: PerformanceMode): void {
  const root = document.documentElement;
  if (mode === "full") {
    delete root.dataset[PERFORMANCE_ATTRIBUTE];
  } else {
    root.dataset[PERFORMANCE_ATTRIBUTE] = mode;
  }
}
