export type StageLayout = "terminals" | "split" | "preview";

// The project stage holds two surfaces side by side. This module owns the
// three rules that follow from that — which surface is on screen, how wide it
// is, and where the divider sits — as pure functions plus one localStorage
// pair, mirroring `companionPreferences.ts`.
//
// It replaces the old two-value `projectMode`, where choosing Preview unmounted
// the terminals, the rail and the side panel.

/** Share of the stage the terminals take in `split`. */
export const STAGE_DEFAULT_RATIO = 0.6;
export const STAGE_MIN_RATIO = 0.25;
export const STAGE_MAX_RATIO = 0.8;
/** Width of the drag divider. Its own column, so neither pane loses a pixel. */
export const STAGE_DIVIDER_PX = 6;
/** One arrow key press. Coarse enough to cross the stage in a few taps. */
const STAGE_RATIO_STEP = 0.02;

const RATIO_KEY = "vibyra.desktop.stageRatio";

interface PreferenceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function browserStorage(): PreferenceStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function clampStageRatio(value: number): number {
  if (!Number.isFinite(value)) return STAGE_DEFAULT_RATIO;
  return Math.min(STAGE_MAX_RATIO, Math.max(STAGE_MIN_RATIO, value));
}

export function restoreStageRatio(storage = browserStorage()): number {
  if (!storage) return STAGE_DEFAULT_RATIO;
  try {
    const stored = storage.getItem(RATIO_KEY);
    return stored === null ? STAGE_DEFAULT_RATIO : clampStageRatio(Number(stored));
  } catch {
    return STAGE_DEFAULT_RATIO;
  }
}

export function saveStageRatio(ratio: number, storage = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(RATIO_KEY, String(clampStageRatio(ratio)));
  } catch {
    // Stage sizing is convenience state and must never block the workspace.
  }
}

/**
 * Whether the terminal grid is on screen.
 *
 * Load-bearing: the native flush budget follows this. Under the old mode
 * switch, "not terminals" meant every PTY went `hidden`; in a split they are
 * visible and must keep their delivery rate, or the pane you are watching
 * beside the preview stops keeping up.
 */
export function terminalsVisible(layout: StageLayout): boolean {
  return layout !== "preview";
}

/** Whether the preview pane is on screen. */
export function previewVisible(layout: StageLayout): boolean {
  return layout !== "terminals";
}

/**
 * The stage's `grid-template-columns`.
 *
 * The collapsed side is removed from the grid rather than sized to zero, so a
 * hidden preview costs no layout — and no transition is declared anywhere: an
 * animated width would refit every xterm on every frame of it.
 */
export function stageColumns(layout: StageLayout, ratio: number): string {
  if (layout !== "split") return "minmax(0, 1fr)";
  const terminals = clampStageRatio(ratio);
  return `minmax(0, ${terminals}fr) ${STAGE_DIVIDER_PX}px minmax(0, ${1 - terminals}fr)`;
}

/**
 * The ratio a pointer at `x` implies, given the stage's box.
 *
 * The divider's own width is taken off the usable span so the grab point stays
 * under the cursor rather than drifting by three pixels as it crosses.
 */
export function ratioFromPointer(x: number, left: number, width: number): number {
  const span = width - STAGE_DIVIDER_PX;
  if (span <= 0) return STAGE_DEFAULT_RATIO;
  return clampStageRatio((x - left - STAGE_DIVIDER_PX / 2) / span);
}

/** Arrow-key resize. Left widens the preview, right widens the terminals. */
export function nudgeStageRatio(ratio: number, key: string): number | null {
  if (key === "ArrowLeft") return clampStageRatio(ratio - STAGE_RATIO_STEP);
  if (key === "ArrowRight") return clampStageRatio(ratio + STAGE_RATIO_STEP);
  if (key === "Home") return STAGE_MIN_RATIO;
  if (key === "End") return STAGE_MAX_RATIO;
  return null;
}
