import { APP_TEMPLATES } from './projectTemplatesApps.ts';
import { BACKEND_TEMPLATES } from './projectTemplatesBackend.ts';
import { CODE_TEMPLATES } from './projectTemplatesCode.ts';
import { WEB_TEMPLATES } from './projectTemplatesWeb.ts';
import type { ProjectKind, ProjectTemplate, ToolId } from './projectTemplateTypes.ts';

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

/**
 * Whether a template creates the project folder itself. Two of these cannot be
 * combined: both scaffolders expect to own an empty folder, so the second one
 * finds the first one's files and fails. That is why the stack step keeps
 * exactly one of these and swaps rather than adds.
 */
function ownsFolder(entry: ProjectTemplate): boolean {
  return entry.steps.some(step => step.cwd === 'parent');
}

/**
 * Whether a template can be added on top of another. Everything it does happens
 * inside a folder that already exists — seeds, or steps that run in the project
 * — so it layers cleanly. An Express server inside a React app is this.
 */
export function canLayer(entry: ProjectTemplate): boolean {
  return entry.id !== 'empty' && !ownsFolder(entry);
}

/**
 * The kinds worth adding to something else. A server and a model layer are the
 * two things people genuinely put inside an app they are already making — a
 * React app with an Express API, a Next.js site with a Claude endpoint.
 */
const ADDABLE_KINDS: ProjectKind[] = ['backend', 'ai'];

/**
 * What can be added to a project of this kind. Layerable by the rule above, so
 * it cannot break the build, and filed under a different question from the one
 * being answered, so the list is not the same stacks a second time.
 *
 * Being able to layer is not on its own a reason to offer it: plain HTML can be
 * written into a Next.js project without failing, and would only be litter.
 */
export function additionsFor(kind: ProjectKind, baseId: string | null): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter(entry => canLayer(entry) && entry.id !== baseId
    && !entry.kinds.includes(kind) && entry.kinds.some(one => ADDABLE_KINDS.includes(one)));
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
