/** Grants are capped by the backend at 500 ids per teammate. */
export const MAX_GRANTS = 500;

/** Adds a grant unless it is already there or the cap is reached. */
export function withGrant(selected: string[], id: string): string[] {
  return selected.includes(id) || selected.length >= MAX_GRANTS ? selected : [...selected, id];
}

/** Services connected from the Access tab that are now installed get ticked;
 * services whose sign-in ended without installing are forgotten. Services that
 * were connected before are never in `waiting`, so they are never ticked. */
export function settleConnects(waiting: string[], installed: string[], active: string[]): { tick: string[]; waiting: string[] } {
  const tick = waiting.filter(id => installed.includes(id));
  return { tick, waiting: waiting.filter(id => !installed.includes(id) && active.includes(id)) };
}
