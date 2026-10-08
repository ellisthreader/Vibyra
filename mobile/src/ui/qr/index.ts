import { encode } from './encode';
import { draw, type Symbol } from './matrix';

export type { Symbol as QrSymbol } from './matrix';

const drawn = new Map<string, Symbol>();

/**
 * A QR symbol for a string, made here rather than fetched, so the code a person is
 * about to scan is on screen in the same frame the page is. The last few are kept,
 * because a page that re-renders is drawing the same code it drew before.
 */
export function qrSymbol(text: string): Symbol {
  const held = drawn.get(text);
  if (held) return held;
  const made = draw(encode(text));
  if (drawn.size > 4) drawn.clear();
  drawn.set(text, made);
  return made;
}
