export interface Rect { x: number; y: number; width: number; height: number }
export interface Size { width: number; height: number }
export interface Insets { top: number; bottom: number }

/** Air between a control and the edge of its lit window. */
export const PAD = 6;
/** Air between the lit window and the card. */
export const GAP = 14;
export const EDGE = 16;
export const CARD_MAX = 344;
/** Corner radius of the lit window; the smallest window is two corners and a little edge. */
export const HOLE_RADIUS = 16;
const MIN_SIDE = HOLE_RADIUS * 2 + 4;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** The lit window for a control: padded, kept inside the screen so all four sides are drawn. */
export function holeFor(rect: Rect, screen: Size): Rect {
  const width = Math.max(MIN_SIDE, rect.width + PAD * 2);
  const height = Math.max(MIN_SIDE, rect.height + PAD * 2);
  const x = clamp(rect.x + rect.width / 2 - width / 2, 2, Math.max(2, screen.width - 2 - width));
  const y = clamp(rect.y + rect.height / 2 - height / 2, 2, Math.max(2, screen.height - 2 - height));
  return { x, y, width: Math.min(width, screen.width - 4), height: Math.min(height, screen.height - 4) };
}

export const cardWidthFor = (screenWidth: number) => Math.min(screenWidth - EDGE * 2, CARD_MAX);

export interface Placement {
  x: number;
  y: number;
  /** Which edge of the card points at the control, or null when the card is docked over a full page. */
  side: 'top' | 'bottom' | null;
  /** Where along the card that pointer sits. */
  pointerX: number;
}

/**
 * Where the card goes: under a control in the top half of the screen, over one in
 * the bottom half, with a pointer aimed at it. With no control (the sample pages)
 * it docks under the status bar.
 */
export function placeCard({ rect, screen, insets, cardWidth, cardHeight }: {
  rect: Rect | null; screen: Size; insets: Insets; cardWidth: number; cardHeight: number;
}): Placement {
  const top = insets.top + 8;
  if (!rect) return { x: (screen.width - cardWidth) / 2, y: top, side: null, pointerX: 0 };
  const hole = holeFor(rect, screen);
  const centre = rect.x + rect.width / 2;
  const below = rect.y + rect.height / 2 < screen.height / 2;
  const x = clamp(centre - cardWidth / 2, EDGE, screen.width - EDGE - cardWidth);
  const wanted = below ? hole.y + hole.height + GAP : hole.y - GAP - cardHeight;
  const y = clamp(wanted, top, Math.max(top, screen.height - insets.bottom - 8 - cardHeight));
  return { x, y, side: below ? 'top' : 'bottom', pointerX: clamp(centre - x, 30, cardWidth - 30) };
}
