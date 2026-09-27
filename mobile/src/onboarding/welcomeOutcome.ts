/**
 * Whether this run of the welcome flow is the one that put a computer on the
 * other end, which is what finishes it on the computer path.
 *
 * The live connection cannot answer that by itself. A computer stays connected
 * across "Show welcome again", and the saved one is reconnected on every launch
 * without anyone asking, so a connection standing here may be nothing this
 * person just did -- and judging it by whether one was up when the flow mounted
 * left the sheet unable to finish the flow it had just completed.
 *
 * Two things count. The connect sheet reporting that it connected is one, true
 * however long that computer had already been on the other end, because they
 * went through the sheet and it succeeded. A connection appearing while the
 * flow is open when there was none at the start is the other: that is a
 * `vibyra://pair` link being followed.
 */
export function pairedHere({
  connected,
  connectedAtStart,
  sheetConnected,
}: {
  connected: boolean;
  connectedAtStart: boolean;
  sheetConnected: boolean;
}): boolean {
  return connected && (sheetConnected || !connectedAtStart);
}
