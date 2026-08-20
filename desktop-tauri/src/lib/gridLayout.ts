/** Column count for an auto-balancing terminal grid. */
export function gridColumns(paneCount: number): number {
  if (paneCount <= 1) return 1;
  if (paneCount <= 4) return 2;
  if (paneCount <= 9) return 3;
  return 4;
}
