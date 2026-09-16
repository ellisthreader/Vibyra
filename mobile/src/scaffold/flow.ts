import { templateById } from './templates';
import type { ProjectKind } from './types';

/** The wizard's screens. `running` covers the build and however it ends. The
 *  desktop also has a `start` fork (build something, or open a folder you have);
 *  the phone has no folder picker, so it begins at the first question. */
export type CreateStep = 'kind' | 'stack' | 'where' | 'options' | 'running';

/** The four questions that carry a progress rail. `running` is the outcome,
 *  so it is not a step you can be "on".
 *
 *  Naming comes before setting up: the name is the answer people already have
 *  in mind when they open this, and the switches read better once the thing
 *  they apply to has a name. Setting up is also the last thing asked, which is
 *  what lets its button start the build instead of turning one more page. */
export const RAIL: CreateStep[] = ['kind', 'stack', 'where', 'options'];

export const STEP_TITLES: Record<CreateStep, string> = {
  kind: 'What are you making?',
  stack: 'Which stack?',
  where: 'Name your project',
  options: 'How should it be set up?',
  running: 'Building your project',
};

/**
 * Where answering, or skipping, the kind question lands. Skipping is `null`,
 * and an empty project has nothing left to choose, so both go straight to
 * naming. That is the whole skip contract: a skipped question never asks a
 * follow-up, and every path still reaches a folder.
 */
export function stepAfterKind(kind: ProjectKind | null): CreateStep {
  return kind === null || kind === 'empty' ? 'where' : 'stack';
}

/** Naming follows the stack, whatever was picked. Every project needs a name;
 *  only some need anything else decided. */
export function stepAfterStack(): CreateStep {
  return 'where';
}

/**
 * The kind to show on the review screen once a stack is picked. Browsing the
 * whole catalog can land on a stack filed elsewhere (Next.js from inside Game).
 * Keep the kind the person chose when the template covers it, and fall back to
 * the template's own first kind when it does not, so "Making: Game / With:
 * Next.js" can never be printed.
 */
export function kindForTemplate(current: ProjectKind | null, templateId: string | null): ProjectKind | null {
  const entry = templateById(templateId);
  if (!entry) return current;
  if (current && entry.kinds.includes(current)) return current;
  return entry.kinds[0] ?? current;
}
