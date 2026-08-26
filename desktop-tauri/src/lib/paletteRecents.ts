// What you reached for last time.
//
// The palette lists everything the app can do, which means the six things any
// one person actually runs are buried among the fifty they never will. This is
// the cheapest fix that does not need a usage database: remember the last few
// ids and let them break ties.

const KEY = "vibyra.desktop.paletteRecents";
const LIMIT = 12;

interface RecentStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function browserStorage(): RecentStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function readPaletteRecents(storage = browserStorage()): string[] {
  if (!storage) return [];
  try {
    const stored = JSON.parse(storage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(stored)) return [];
    return stored.filter((id): id is string => typeof id === "string").slice(0, LIMIT);
  } catch {
    return [];
  }
}

/** Records a run and returns the new list, newest first. */
export function notePaletteRun(id: string, storage = browserStorage()): string[] {
  const next = [id, ...readPaletteRecents(storage).filter((candidate) => candidate !== id)]
    .slice(0, LIMIT);
  try {
    storage?.setItem(KEY, JSON.stringify(next));
  } catch {
    // A palette that cannot remember is still a palette.
  }
  return next;
}

/**
 * A tiebreaker, not a ranking.
 *
 * Capped well below the gap between a phrase hit and a fuzzy one so that
 * habit never outranks what was actually typed — it only decides between two
 * entries the query liked equally.
 */
export function recencyBoost(id: string, recents: string[]): number {
  const index = recents.indexOf(id);
  return index < 0 ? 0 : 30 - index * 2;
}
