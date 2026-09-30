// Where a new project lands, worked out in one place so the wizard can show the
// resolved path while it is being typed. Rust still has the last word on
// whether the folder can actually be written; this is the fast, local half.
// The phone's copy is `mobile/src/scaffold/destination.ts`; keep them in step.

const MAX_SLUG = 48;

/** A folder name from whatever was typed. Empty when nothing survives. */
export function slugify(name: string): string {
  return name.normalize('NFKD').toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, MAX_SLUG).replace(/-$/, '');
}

/** The same name as an identifier; React Native rejects anything else. */
export function pascalCase(name: string): string {
  const words = slugify(name).split('-').filter(Boolean);
  const joined = words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
  return /^[0-9]/.test(joined) ? `App${joined}` : joined;
}

export function expandHome(path: string, homeDir: string): string {
  const trimmed = path.trim();
  if (trimmed === '~') return homeDir;
  return trimmed.startsWith('~/') ? `${homeDir}${trimmed.slice(1)}` : trimmed;
}

/** Windows drive letters count: the Host runs there too, and its `Path`
 *  accepts forward slashes on both platforms. */
const ABSOLUTE = /^([A-Za-z]:[\\/]|\/)/;

export function joinPath(parent: string, child: string): string {
  return `${parent.replace(/[\\/]+$/, '')}/${child}`;
}

export function parentOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return cut > 0 ? trimmed.slice(0, cut) : '/';
}

/** A name that is not already a project in this folder. */
export function suggestedName(projectPaths: string[], parent: string, base = 'untitled'): string {
  const inside = parent.replace(/[\\/]+$/, '');
  const taken = new Set(projectPaths.filter(path => parentOf(path) === inside)
    .map(path => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop()));
  if (!taken.has(base)) return base;
  for (let index = 2; index < 500; index += 1) if (!taken.has(`${base}-${index}`)) return `${base}-${index}`;
  return `${base}-${Date.now().toString(36)}`;
}

export interface Destination { slug: string; path: string; error: string | null }

export function resolveDestination(parent: string, name: string, homeDir: string): Destination {
  const root = expandHome(parent, homeDir);
  const slug = slugify(name);
  if (!ABSOLUTE.test(root)) return { slug, path: '', error: 'Choose a folder to put the project in.' };
  if (!name.trim()) return { slug, path: '', error: 'Give the project a name.' };
  if (!slug) return { slug, path: '', error: 'Use letters or numbers in the name.' };
  return { slug, path: joinPath(root, slug), error: null };
}

/** The folder new projects go beside: wherever most of the existing ones live,
 *  else `~/Projects`. Nothing is created until the project is. */
export function defaultParent(roots: string[], homeDir: string): string {
  const counts = new Map<string, number>();
  for (const root of roots) {
    const parent = parentOf(root);
    if (parent === homeDir || parent === '/') continue;
    counts.set(parent, (counts.get(parent) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [parent, count] of counts) {
    if (count > bestCount) { best = parent; bestCount = count; }
  }
  return best ?? joinPath(homeDir, 'Projects');
}
