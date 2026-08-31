export type DockTool = "preview" | "ask" | "files" | "review";
export type DockSize = "compact" | "wide" | "full";

// The dock owns the workspace's right edge: one floating panel holding the
// preview, Ask, the file tree and the review of a pane's changes.
//
// It replaces the pair that used to split that job — `stageLayout.ts`, which
// sized a preview pane inside the stage grid, and `companionPreferences.ts`,
// which sized a separate docked aside. Two sizing models on one edge, neither
// aware of the other, and a companion that vanished whenever the preview took
// the stage. This module owns the rules that follow from having one surface:
// how wide it is at each step, whether the terminals are still on screen, and
// the three localStorage keys that survive a restart.

/** Inset between the dock and the workspace edges. The float, in one number. */
export const DOCK_GAP_PX = 10;

/** Compact is a reading width — an answer, a file tree, a diff. */
export const DOCK_COMPACT_DEFAULT = 360;
export const DOCK_COMPACT_MIN = 300;
export const DOCK_COMPACT_MAX = 560;

/** Wide is a share of the workspace, so a preview gets a real viewport. */
export const DOCK_WIDE_DEFAULT_RATIO = 0.44;
export const DOCK_WIDE_MIN_RATIO = 0.25;
export const DOCK_WIDE_MAX_RATIO = 0.75;

/** One arrow key press on the grip, in each size's own unit. */
const COMPACT_STEP_PX = 16;
const WIDE_STEP_RATIO = 0.02;

const TOOL_KEY = "vibyra.desktop.dockTool";
const COMPACT_KEY = "vibyra.desktop.dockCompactWidth";
const WIDE_KEY = "vibyra.desktop.dockWideRatio";

const TOOLS: DockTool[] = ["preview", "ask", "files", "review"];

interface PreferenceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function browserStorage(): PreferenceStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function clampCompactWidth(value: number): number {
  const width = Number.isFinite(value) ? Math.round(value) : DOCK_COMPACT_DEFAULT;
  return Math.max(DOCK_COMPACT_MIN, Math.min(DOCK_COMPACT_MAX, width));
}

export function clampWideRatio(value: number): number {
  if (!Number.isFinite(value)) return DOCK_WIDE_DEFAULT_RATIO;
  return Math.min(DOCK_WIDE_MAX_RATIO, Math.max(DOCK_WIDE_MIN_RATIO, value));
}

/** Clamps in whichever unit `size` stores: pixels compact, a share wide. */
export function clampDockWidth(size: DockSize, value: number): number {
  return size === "compact" ? clampCompactWidth(value) : clampWideRatio(value);
}

/**
 * Whether the terminal grid is on screen.
 *
 * Load-bearing: the native flush budget follows this. Only a full-size dock
 * takes the terminals off screen — at compact and wide they sit beside it and
 * must keep their delivery rate, or the pane you are watching next to a
 * running preview stops keeping up.
 */
export function terminalsVisible(size: DockSize, open: boolean): boolean {
  return !open || size !== "full";
}

/** The stored width for the size in play, in that size's own unit. */
export function dockValue(size: DockSize, compact: number, ratio: number): number {
  return size === "compact" ? compact : ratio;
}

/** The dock's own width, as a CSS length. `full` is an inset, not a width. */
export function dockWidth(size: DockSize, value: number): string {
  if (size === "compact") return `${clampCompactWidth(value)}px`;
  if (size === "wide") return `${(clampWideRatio(value) * 100).toFixed(3)}%`;
  return "auto";
}

/**
 * The room the terminals give up so the dock never covers them.
 *
 * Deliberately separate from `dockWidth`: this one is committed on release,
 * not on every drag frame. The dock is out of the flex flow, so its own width
 * can follow the pointer for free — but the reserve *is* terminal layout, and
 * every change to it refits every xterm on screen. One refit per drag, not one
 * per frame, which is what the old flex-basis companion cost.
 */
export function dockReserve(size: DockSize, open: boolean, value: number): string {
  if (!open || size === "full") return "0px";
  return `calc(${dockWidth(size, value)} + ${DOCK_GAP_PX * 2}px)`;
}

/**
 * The width a pointer at `x` implies, in the unit `size` stores.
 *
 * Measured inwards from the workspace's right edge with the float's own inset
 * taken off, so the grab point stays under the cursor rather than drifting by
 * the gap as it crosses.
 */
export function dockWidthFromPointer(
  size: DockSize,
  x: number,
  hostLeft: number,
  hostWidth: number,
): number {
  const span = hostWidth - DOCK_GAP_PX * 2;
  if (span <= 0) {
    return size === "compact" ? DOCK_COMPACT_DEFAULT : DOCK_WIDE_DEFAULT_RATIO;
  }
  const fromRight = hostLeft + hostWidth - DOCK_GAP_PX - x;
  return size === "compact" ? clampCompactWidth(fromRight) : clampWideRatio(fromRight / span);
}

/** Arrow-key resize on the grip. Left widens the dock, right narrows it. */
export function nudgeDockWidth(size: DockSize, value: number, key: string): number | null {
  const compact = size === "compact";
  const step = compact ? COMPACT_STEP_PX : WIDE_STEP_RATIO;
  if (key === "ArrowLeft") return clampDockWidth(size, value + step);
  if (key === "ArrowRight") return clampDockWidth(size, value - step);
  if (key === "Home") return compact ? DOCK_COMPACT_MIN : DOCK_WIDE_MIN_RATIO;
  if (key === "End") return compact ? DOCK_COMPACT_MAX : DOCK_WIDE_MAX_RATIO;
  return null;
}

function readNumber(
  storage: PreferenceStorage | null,
  key: string,
  fallback: number,
  clamp: (value: number) => number,
): number {
  if (!storage) return fallback;
  try {
    const stored = storage.getItem(key);
    return stored === null ? fallback : clamp(Number(stored));
  } catch {
    return fallback;
  }
}

function writeNumber(storage: PreferenceStorage | null, key: string, value: number): void {
  if (!storage) return;
  try {
    storage.setItem(key, String(value));
  } catch {
    // Dock sizing is convenience state and must never block the workspace.
  }
}

export function restoreCompactWidth(storage = browserStorage()): number {
  return readNumber(storage, COMPACT_KEY, DOCK_COMPACT_DEFAULT, clampCompactWidth);
}

export function saveCompactWidth(width: number, storage = browserStorage()): void {
  writeNumber(storage, COMPACT_KEY, clampCompactWidth(width));
}

export function restoreWideRatio(storage = browserStorage()): number {
  return readNumber(storage, WIDE_KEY, DOCK_WIDE_DEFAULT_RATIO, clampWideRatio);
}

export function saveWideRatio(ratio: number, storage = browserStorage()): void {
  writeNumber(storage, WIDE_KEY, clampWideRatio(ratio));
}

/**
 * The tool the dock reopens to.
 *
 * "Closed" is never stored: shutting the dock is a thing you did just now, not
 * a preference, and reopening to a blank panel would be worse than reopening
 * to whatever you last had up.
 *
 * Anything not in `TOOLS` falls back, which is what retires or renames a tool
 * for free — a dock left on `memory`, or on `chat` before it became `ask`,
 * reopens on the default.
 */
export function restoreDockTool(storage = browserStorage()): DockTool {
  if (!storage) return "ask";
  try {
    const value = storage.getItem(TOOL_KEY);
    return TOOLS.includes(value as DockTool) ? (value as DockTool) : "ask";
  } catch {
    return "ask";
  }
}

export function saveDockTool(tool: DockTool, storage = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(TOOL_KEY, tool);
  } catch {
    // The selected tool remains usable when storage is unavailable.
  }
}
