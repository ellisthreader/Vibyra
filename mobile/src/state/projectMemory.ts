import type { Project } from '../ui/types';
import type { WorkspaceStore } from './WorkspaceStore';

/**
 * The folders a computer was last seen sharing, kept on the phone so the
 * Projects page has something to show while that computer is away.
 *
 * These are a memory, never a live list. They are held apart from
 * `state.projects` on purpose: six different paths blank the live list — a
 * dropped socket, a disconnect, even backgrounding the app — and every action
 * refuses without a connection anyway. Keeping the two separate means nothing
 * can mistake a remembered folder for one the computer is currently sharing.
 *
 * They live in `flags`, not `storage`: a project's name and path are device
 * state, not a secret, and the Keychain is both the wrong tier and unreliable
 * above a couple of kilobytes. On the web `flags` is localStorage, where
 * `storage` is memory only, so this is also the tier that survives a reload.
 */
export interface RememberedProjects {
  projects: Project[];
  /** When the computer last answered with them, ISO 8601. */
  seenAt: string;
}

/** Enough for the 32 a Host will share, and no room for a pathological path. */
const MAX_PROJECTS = 32;
const MAX_PATH = 2048;
const VERSION = 1;

const key = (hostId: string) => `projects.${hostId}`;

function clean(value: unknown): Project[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_PROJECTS).flatMap(item => {
    if (typeof item !== 'object' || item === null) return [];
    const { id, name, path, branch } = item as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof path !== 'string') return [];
    if (path.length > MAX_PATH || id.length > 256 || name.length > 256) return [];
    return [{ id, name, path, ...(typeof branch === 'string' ? { branch } : {}) }];
  });
}

/** Keeps what the computer just reported, under that computer's own id. */
export async function rememberProjects(store: WorkspaceStore, hostId: string, projects: Project[]): Promise<void> {
  const kept = clean(projects);
  if (kept.length === 0) return void (await forgetRemembered(store, hostId));
  await store.deps.flags.write(key(hostId),
    JSON.stringify({ version: VERSION, seenAt: new Date().toISOString(), projects: kept }));
}

/**
 * What that computer was last sharing, or null. Never throws: a cache that
 * cannot be read is a page with nothing on it, not a phone that will not
 * reconnect — `initialize` runs auto-connect after this.
 */
export async function recallProjects(store: WorkspaceStore, hostId: string): Promise<RememberedProjects | null> {
  try {
    const value = await store.deps.flags.read(key(hostId));
    if (!value) return null;
    const saved = JSON.parse(value) as { version?: number; seenAt?: unknown; projects?: unknown };
    if (saved.version !== VERSION) return null;
    const projects = clean(saved.projects);
    const seenAt = typeof saved.seenAt === 'string' ? saved.seenAt : '';
    return projects.length > 0 && seenAt ? { projects, seenAt } : null;
  } catch { return null; }
}

/** Forgetting a computer forgets its folders with it. */
export async function forgetRemembered(store: WorkspaceStore, hostId: string): Promise<void> {
  try { await store.deps.flags.delete(key(hostId)); } catch { /* a cache that will not clear is not worth failing over */ }
}
