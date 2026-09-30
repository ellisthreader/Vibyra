import { buildScaffoldRequest, describeSteps, type ScaffoldRequest } from './projectTemplateCommand.ts';
import { resolveDestination, type Destination } from './projectDestination.ts';
import { EMPTY_TEMPLATE, templateById } from './projectTemplates.ts';
import type { ProjectTemplate, TemplateOptions } from './projectTemplateTypes.ts';

/**
 * What the answers so far add up to: the templates, the folder and the exact
 * work Rust will be asked to do. Pure, so the setup step can show the literal
 * commands and the build sends the very same ones.
 *
 * The phone's copy is `mobile/src/scaffold/planned.ts`.
 */
export interface PlannedProject {
  entry: ProjectTemplate;
  /** The stacks layered on the base, already resolved and in pick order. */
  extras: ProjectTemplate[];
  destination: Destination;
  request: ScaffoldRequest;
  commands: string[];
}

export interface PlanInput {
  templateId: string | null;
  extraIds: string[];
  parent: string;
  name: string;
  home: string;
  options: TemplateOptions;
}

export function plannedProject(state: PlanInput): PlannedProject {
  const entry = templateById(state.templateId) ?? EMPTY_TEMPLATE;
  const extras = (state.extraIds ?? []).map(templateById)
    .filter((pick): pick is ProjectTemplate => pick !== null && pick.id !== entry.id);
  const destination = resolveDestination(state.parent, state.name, state.home);
  const request = buildScaffoldRequest(entry, destination.path, state.options, extras);
  return { entry, extras, destination, request, commands: describeSteps(request) };
}
