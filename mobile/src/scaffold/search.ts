import { kindName } from './kinds';
import { PROJECT_TEMPLATES } from './templates';
import type { ProjectKind, ProjectTemplate } from './types';

// Searching the whole catalog, for when the stack you want is not filed under
// the kind you picked. The desktop reuses its command palette's matcher; the
// phone has none, so this is the same idea in a few lines: a word-prefix match
// on the name outranks one on the keywords, and ties keep catalog order.

/** Plain words for each kind, so "phone" finds every mobile stack and "api" every backend. */
const KIND_WORDS: Record<ProjectKind, string> = {
  website: 'site web pages', webapp: 'web app site', mobile: 'phone ios android app', desktop: 'mac windows linux native',
  game: 'game engine 2d 3d', backend: 'api server endpoints', library: 'package cli tool script', ai: 'llm model claude anthropic', empty: 'folder',
};

/** What a template answers to besides its name: its id, its blurb, and the
 *  kinds it is filed under, so "phone" finds Expo and "api" finds Axum. */
function keywordsFor(entry: ProjectTemplate): string {
  return [entry.id, entry.blurb, ...entry.kinds.flatMap(kind => [kindName(kind), KIND_WORDS[kind]])].join(' ').toLowerCase();
}

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9.+#]+/).filter(Boolean);

/** 0 when nothing matches; higher is closer. Every typed word must land somewhere. */
export function templateScore(entry: ProjectTemplate, query: string): number {
  const typed = words(query);
  if (typed.length === 0) return 1;
  const name = entry.name.toLowerCase();
  const nameWords = words(entry.name);
  const keywords = keywordsFor(entry);
  let score = 0;
  for (const word of typed) {
    if (name.startsWith(word)) score += 6;
    else if (nameWords.some(part => part.startsWith(word))) score += 4;
    else if (name.includes(word)) score += 3;
    else if (keywords.includes(word)) score += 1;
    else return 0;
  }
  return score;
}

export function searchTemplates(query: string): ProjectTemplate[] {
  const trimmed = query.trim();
  if (!trimmed) return PROJECT_TEMPLATES;
  const hits: { entry: ProjectTemplate; score: number }[] = [];
  for (const entry of PROJECT_TEMPLATES) {
    const score = templateScore(entry, trimmed);
    if (score > 0) hits.push({ entry, score });
  }
  // Sort is stable, so templates that score the same keep catalog order.
  return hits.sort((left, right) => right.score - left.score).map(hit => hit.entry);
}
