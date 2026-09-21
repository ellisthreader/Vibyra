/**
 * The geometry of the effort slider, kept apart from the view so it can be tested.
 *
 * The model's own ladder runs left to right, cheapest first, spread evenly along a
 * track inset by the thumb's radius at each end so the thumb never overhangs it.
 */

/** Where rung `index` sits along a track `length` points long. */
export const stopAt = (index: number, length: number, count: number, inset: number) =>
  count < 2 ? length / 2 : inset + (index * (length - 2 * inset)) / (count - 1);

/**
 * The rung, as a fraction, under a point `x` along the track: continuous while a
 * finger moves, so the thumb follows it rather than jumping between stops.
 */
export function positionAt(x: number, length: number, count: number, inset: number) {
  if (count < 2 || length <= 2 * inset) return 0;
  return Math.min(count - 1, Math.max(0, ((x - inset) * (count - 1)) / (length - 2 * inset)));
}

/** The rung a position settles on when the finger lifts. */
export const rungAt = (position: number, count: number) =>
  Math.min(Math.max(count - 1, 0), Math.max(0, Math.round(position)));
