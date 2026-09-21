/**
 * Pointer input aimed at the part of a pane the terminal does not cover.
 *
 * The bottom anchor translates the xterm element down by its unused rows, so
 * a CLI drawing a short screen — an update notice, a permission prompt — can
 * leave most of the pane sitting over the host div rather than the terminal.
 * Clicks and wheels there reach no terminal on their own, and a pane that
 * answers a click with nothing but a focus ring is one the user cannot type
 * into at all. `TerminalView` forwards them using these.
 */

/** True when the event landed on the pane instead of on the terminal. */
export function pointerMissedTerminal(
  element: Element | null | undefined,
  target: EventTarget | null,
): boolean {
  if (!element) return false;
  return !(target instanceof Node) || !element.contains(target);
}

/** Fallback row height, for a wheel that arrives before the first fit. */
const ASSUMED_CELL_HEIGHT = 15;

/**
 * Wheel distance in terminal rows. Pixel deltas (`deltaMode` 0, what every
 * browser sends on a trackpad) divide by the row height; line deltas already
 * count rows. A delta too small to round to a row still moves one, so a slow
 * scroll creeps instead of doing nothing.
 */
export function terminalWheelLines(
  deltaY: number,
  deltaMode: number,
  cellHeight: number,
): number {
  const step = deltaMode === 0 ? cellHeight || ASSUMED_CELL_HEIGHT : 1;
  return Math.round(deltaY / step) || Math.sign(deltaY);
}
