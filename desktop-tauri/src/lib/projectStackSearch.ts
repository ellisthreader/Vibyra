import { paletteScore } from "./paletteQuery.ts";
import { kindName } from "./projectTemplateKinds.ts";
import { PROJECT_TEMPLATES } from "./projectTemplates.ts";
import type { ProjectTemplate } from "./projectTemplateTypes";

// Searching the whole catalog, for when the stack you want is not filed under
// the kind you picked. Deliberately the command palette's matcher rather than
// a second one: the same typing gets the same ranking everywhere in the app.

/** What a template answers to besides its name: its id, its blurb, and the
 * kinds it is filed under — so "phone" finds Expo and "api" finds Axum. */
function keywordsFor(entry: ProjectTemplate): string {
  return [entry.id, entry.blurb, ...entry.kinds.map(kindName)].join(" ");
}

export function searchTemplates(query: string): ProjectTemplate[] {
  const trimmed = query.trim();
  if (!trimmed) return PROJECT_TEMPLATES;
  const hits: { entry: ProjectTemplate; score: number }[] = [];
  for (const entry of PROJECT_TEMPLATES) {
    const match = paletteScore(entry.name, keywordsFor(entry), trimmed);
    if (match) hits.push({ entry, score: match.score });
  }
  // Sort is stable, so templates that score the same keep catalog order.
  return hits.sort((left, right) => right.score - left.score).map((hit) => hit.entry);
}
