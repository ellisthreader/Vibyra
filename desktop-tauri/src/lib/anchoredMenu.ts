import type { CSSProperties } from "react";

// Placement for a menu portalled to the document root and anchored to a
// trigger somewhere inside a scrolling panel. Pure and DOM-read-only so the
// component owning the menu stays about behaviour.

const VIEWPORT_MARGIN = 12;
const GAP = 5;

export interface AnchorOptions {
  /** Widest the menu may be drawn, before the viewport clamps it. */
  minWidth: number;
  /** Tallest the list may grow before it scrolls. */
  maxHeight: number;
  /** The height the list actually wants, when it has been measured. */
  wanted?: number;
  /** Keep the menu inside this box rather than the window — the dialog it
   * belongs to, say, so it cannot hang off the panel onto the scrim. */
  bounds?: DOMRect;
}

/**
 * `null` means the trigger has scrolled out of the window and there is nothing
 * left to anchor to — the caller should close.
 *
 * Two details the obvious version gets wrong. The flip decision has to use the
 * height the list *wants*, not the cap: reserving the cap flips the menu above
 * its trigger with plenty of room below it. And once flipped it has to be
 * anchored by its bottom edge, or a short list hangs its reserved height up
 * from the trigger and leaves a hole underneath.
 */
export function anchorTo(rect: DOMRect, options: AnchorOptions): CSSProperties | null {
  const box = options.bounds;
  const edge = {
    top: box ? box.top + VIEWPORT_MARGIN : VIEWPORT_MARGIN,
    bottom: (box ? box.bottom : window.innerHeight) - VIEWPORT_MARGIN,
    left: box ? box.left + VIEWPORT_MARGIN : VIEWPORT_MARGIN,
    right: (box ? box.right : window.innerWidth) - VIEWPORT_MARGIN,
  };
  if (rect.bottom < edge.top || rect.top > edge.bottom) return null;
  const width = Math.min(Math.max(rect.width, options.minWidth), edge.right - edge.left);
  const below = edge.bottom - rect.bottom;
  const above = rect.top - edge.top;
  const wanted = Math.min(options.maxHeight, options.wanted || options.maxHeight);
  const up = below < wanted && above > below;
  // A menu wider than its trigger hangs off the RIGHT edge if it is left
  // aligned, which in a settings row means overhanging the column it belongs
  // to and stopping just short of the group border. Aligning the far edges
  // instead lets it grow back into the empty space on its left.
  const left = width > rect.width ? rect.right - width : rect.left;
  return {
    top: up ? undefined : Math.max(edge.top, rect.bottom + GAP),
    bottom: up ? Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.top + GAP) : undefined,
    left: Math.max(edge.left, Math.min(left, edge.right - width)),
    width,
    maxHeight: Math.min(options.maxHeight, up ? above : below),
  };
}

/** A menu that follows a scrolling panel is re-placed every frame; a fresh
 * object each time re-fires anything downstream that depends on the position. */
export function samePlace(a: CSSProperties, b: CSSProperties): boolean {
  return a.top === b.top && a.bottom === b.bottom && a.left === b.left
    && a.width === b.width && a.maxHeight === b.maxHeight;
}
