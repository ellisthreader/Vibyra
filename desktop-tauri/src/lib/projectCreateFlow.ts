import { templateById } from "./projectTemplates.ts";
import type { ProjectKind } from "./projectTemplateTypes";

/** The wizard's screens. `running` covers the build and however it ends. */
export type CreateStep = "start" | "kind" | "stack" | "options" | "where" | "review" | "running";

/** The four questions that carry a progress rail. `start` is the front door
 * and `running` is the outcome, so neither is a step you can be "on". */
export const RAIL: CreateStep[] = ["kind", "stack", "options", "where"];

/**
 * Where answering — or skipping — the kind question lands.
 *
 * Skipping is `null`, and an empty project has nothing left to choose, so both
 * go straight to naming. That is the whole skip contract: a skipped question
 * never asks a follow-up, and every path still reaches a folder.
 */
export function stepAfterKind(kind: ProjectKind | null): CreateStep {
  return kind === null || kind === "empty" ? "where" : "stack";
}

/** Options are only worth asking about when the template runs something. */
export function stepAfterStack(templateId: string | null): CreateStep {
  const entry = templateById(templateId);
  return entry && entry.steps.length > 0 ? "options" : "where";
}

/**
 * The kind to show on the review screen once a stack is picked.
 *
 * Browsing the whole catalog can land on a stack filed elsewhere — Next.js
 * from inside Game. Keep the kind the user chose when the template covers it,
 * and fall back to the template's own primary kind when it does not, so
 * "Making: Game / With: Next.js" can never be printed.
 */
export function kindForTemplate(
  current: ProjectKind | null,
  templateId: string | null,
): ProjectKind | null {
  const entry = templateById(templateId);
  if (!entry) return current;
  if (current && entry.kinds.includes(current)) return current;
  return entry.kinds[0] ?? current;
}
