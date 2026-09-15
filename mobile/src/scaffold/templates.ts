import { APP_TEMPLATES } from './templatesApps';
import { BACKEND_TEMPLATES } from './templatesBackend';
import { CODE_TEMPLATES } from './templatesCode';
import { WEB_TEMPLATES } from './templatesWeb';
import type { ProjectKind, ProjectTemplate, ToolId } from './types';

/** Every stack Vibyra can start, in one list. Order inside a kind is the order
 *  the stack step shows them, so the first entry is the safe default. */
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  ...WEB_TEMPLATES, ...BACKEND_TEMPLATES, ...APP_TEMPLATES, ...CODE_TEMPLATES,
];

export function templatesForKind(kind: ProjectKind): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter(entry => entry.kinds.includes(kind));
}

export function templateById(id: string | null): ProjectTemplate | null {
  if (!id) return null;
  return PROJECT_TEMPLATES.find(entry => entry.id === id) ?? null;
}

/** Everything the whole catalog could need, asked for in one preflight call. */
export function allRequiredTools(): ToolId[] {
  const tools = new Set<ToolId>();
  for (const entry of PROJECT_TEMPLATES) for (const tool of entry.requires) tools.add(tool);
  return [...tools];
}

/** Whether the dependencies switch means anything for this template. */
export function hasInstallStep(entry: ProjectTemplate): boolean {
  return entry.steps.some(step => step.phase === 'install');
}

/** Required tools the computer has said are not on its PATH. A tool stays
 *  usable until the computer has actually answered: an unanswered preflight
 *  is not a missing toolchain. */
export function missingTools(entry: ProjectTemplate, tools: Record<string, boolean>): string[] {
  return entry.requires.filter(tool => tools[tool] === false);
}

/** The folder as it stands, for skipped questions: nothing installed, nothing run. */
export const EMPTY_TEMPLATE: ProjectTemplate = templateById('empty')!;
