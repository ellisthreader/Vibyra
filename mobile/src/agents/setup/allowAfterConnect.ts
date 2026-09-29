/**
 * Services the person just connected from the setup screen become allowed for the teammate being
 * edited. Only services that finished connecting (`connected`) and are now installed are added;
 * anything already allowed stays as it is, and nothing is added while access can't be changed.
 * Returns the same array when nothing changes so callers can skip a pointless update.
 */
export function allowAfterConnect(
  selected: string[],
  connected: string[],
  installed: string[],
  canGrant: boolean,
): string[] {
  if (!canGrant) return selected;
  const add = connected.filter((id, i) => installed.includes(id) && connected.indexOf(id) === i && !selected.includes(id));
  return add.length ? [...selected, ...add] : selected;
}
