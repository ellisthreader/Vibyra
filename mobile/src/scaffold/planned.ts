import { buildScaffoldRequest, describeSteps, type ScaffoldRequest } from './command';
import { resolveDestination, type Destination } from './destination';
import { EMPTY_TEMPLATE, templateById } from './templates';
import type { ProjectTemplate } from './types';
import type { WizardState } from './wizard';

/**
 * What the answers so far add up to: the template, the folder and the exact
 * work the computer will be asked to do. Pure, so the review step shows the
 * literal commands and the build sends the same ones.
 */
export interface PlannedProject {
  entry: ProjectTemplate;
  /** The stacks layered on the base, already resolved and in pick order. */
  extras: ProjectTemplate[];
  destination: Destination;
  request: ScaffoldRequest;
  commands: string[];
}

export function plannedProject(
  state: Pick<WizardState, 'templateId' | 'extraIds' | 'parent' | 'name' | 'home' | 'options'>,
): PlannedProject {
  const entry = templateById(state.templateId) ?? EMPTY_TEMPLATE;
  const extras = (state.extraIds ?? []).map(templateById)
    .filter((pick): pick is ProjectTemplate => pick !== null && pick.id !== entry.id);
  const destination = resolveDestination(state.parent, state.name, state.home);
  const request = buildScaffoldRequest(entry, destination.path, state.options, extras);
  return { entry, extras, destination, request, commands: describeSteps(request) };
}
