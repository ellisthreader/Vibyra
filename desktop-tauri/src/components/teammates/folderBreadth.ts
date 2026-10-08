/**
 * F-31. The Mac opens the folder picker itself, so only it sees the path before anything is granted. For the
 * home folder, a disk root or a broad parent (Desktop, Documents ...) `agent_computer_choose` grants nothing
 * and answers `{ broad, path, label }`; the person must then confirm a read-only grant. This only recognises
 * that answer and words it. Plain text only, never markup.
 */
export type Breadth = 'home' | 'root' | 'broad';
export interface BroadChoice { broad: Breadth; path: string; label: string }

const KINDS: readonly string[] = ['home', 'root', 'broad'];

export function broadChoice(value: unknown): BroadChoice | null {
  const v = (value ?? {}) as Record<string, unknown>;
  if (typeof v.broad !== 'string' || !KINDS.includes(v.broad) || typeof v.path !== 'string' || !v.path) return null;
  const path = v.path.slice(0, 300);
  const label = typeof v.label === 'string' && v.label ? v.label.slice(0, 80) : path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
  return { broad: v.broad as Breadth, path, label };
}

export const breadthWords: Record<Breadth, { title: string; detail: string }> = {
  home: { title: 'This is your whole home folder.', detail: 'It holds far more than one project, and everything in it could be sent to the AI model.' },
  root: { title: 'This is the top level of a disk.', detail: 'It holds far more than one project, and everything in it could be sent to the AI model.' },
  broad: { title: 'This folder holds a lot more than one project.', detail: 'Your teammate would be able to read everything in it, and it could be sent to the AI model.' },
};
