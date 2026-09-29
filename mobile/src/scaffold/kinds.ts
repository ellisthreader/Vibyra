import type { KindSpec, ProjectKind } from './types';

/** The first question: what are you making? Ordered by how often it is the
 *  answer, with "empty" last because it is the escape hatch, not a choice. */
export const PROJECT_KINDS: KindSpec[] = [
  { id: 'website', name: 'Website', blurb: 'Landing pages, docs, a portfolio' },
  { id: 'webapp', name: 'Web app', blurb: 'Accounts, data, a dashboard' },
  { id: 'mobile', name: 'Mobile app', blurb: 'iOS and Android from one codebase' },
  { id: 'desktop', name: 'Desktop app', blurb: 'Mac, Windows and Linux' },
  { id: 'game', name: 'Game', blurb: '2D, 3D or in the browser' },
  { id: 'backend', name: 'Backend or API', blurb: 'Endpoints other apps call' },
  { id: 'library', name: 'Library or CLI', blurb: 'A package, tool or script' },
  { id: 'ai', name: 'AI app', blurb: 'Chat, agents, anything with a model' },
  { id: 'empty', name: 'Empty project', blurb: 'Just the folder — you take it from here' },
];

export function kindName(id: ProjectKind): string {
  return PROJECT_KINDS.find((kind) => kind.id === id)?.name ?? 'Project';
}
