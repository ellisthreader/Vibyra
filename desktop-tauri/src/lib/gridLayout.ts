/** Keep each terminal readable when a tools panel narrows the stage. */
export function gridColumns(paneCount: number, availableWidth = Infinity): number {
  const balanced = paneCount <= 1 ? 1 : paneCount <= 4 ? 2 : paneCount <= 9 ? 3 : 4;
  const capacity = Math.max(1, Math.floor(availableWidth / 360));
  return Math.min(balanced, capacity);
}
