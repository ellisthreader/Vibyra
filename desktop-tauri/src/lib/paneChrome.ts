/**
 * Fixed pixel cost of a pane's frame, at each density the grid can pick.
 *
 * Every number here is also spent in CSS (`terminal-density.css`), and read
 * back by `spawnGeometry.ts` to predict the grid FitAddon will build. Change
 * one and the other two must follow, or panes reflow on spawn.
 *
 * `insetX`/`insetY` are the two axes of `.term-view` padding summed, not the
 * individual sides; `header` is the `.pane__header` min-height.
 */
export type PaneDensity = "comfortable" | "compact" | "dense";

export interface PaneChrome {
  header: number;
  insetX: number;
  insetY: number;
  gap: number;
  padding: number;
}

export const PANE_CHROME: Record<PaneDensity, PaneChrome> = {
  comfortable: { header: 44, insetX: 12, insetY: 12, gap: 8, padding: 8 },
  compact: { header: 34, insetX: 10, insetY: 8, gap: 6, padding: 6 },
  dense: { header: 26, insetX: 8, insetY: 6, gap: 4, padding: 4 },
};

/** Pane border, both sides. */
export const PANE_BORDER_PX = 2;

/**
 * xterm's `ViewportConstants.DEFAULT_SCROLL_BAR_WIDTH`. FitAddon subtracts it
 * from the available width whenever `scrollback > 0`, so leaving it out makes
 * every predicted grid ~2 columns wider than the one xterm builds.
 */
export const SCROLLBAR_PX = 14;

/**
 * Pane height at which the frame stops earning its space. Measured with the
 * comfortable spacing so the choice cannot feed back into itself: picking a
 * smaller header would grow the pane, which would ask for a larger header.
 */
export function densityFor(paneHeight: number): PaneDensity {
  if (paneHeight >= 400) return "comfortable";
  if (paneHeight >= 260) return "compact";
  return "dense";
}
