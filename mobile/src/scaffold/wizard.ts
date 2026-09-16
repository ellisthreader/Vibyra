import { kindForTemplate, stepAfterKind, stepAfterStack, type CreateStep } from './flow';
import { suggestedName } from './destination';
import { DEFAULT_TEMPLATE_OPTIONS, type ProjectKind, type TemplateOptions } from './types';
import type { ScaffoldProgress } from './api';
import type { Project } from '../ui/types';

/**
 * The wizard as a state machine, mirroring the desktop's create store: the
 * answers so far, which screen is showing and the way back, and the build once
 * it starts. Pure, so the flow is tested without a screen.
 */
export type RunPhase = 'idle' | 'running' | 'failed' | 'stalled' | 'done';

export interface WizardState {
  step: CreateStep;
  history: CreateStep[];
  kind: ProjectKind | null;
  /** The stack that makes the project. Exactly one, because only one scaffolder
   *  can own a new folder. */
  templateId: string | null;
  /** Stacks layered on top of it, in the order they were picked. */
  extraIds: string[];
  options: TemplateOptions;
  /** The computer's home folder and where projects go, once preflight answers. */
  home: string;
  parent: string;
  name: string;
  /** The stack step is showing the whole catalog rather than the chosen kind's. */
  browsing: boolean;
  /** Executable name → on PATH. Empty until the first preflight answers. */
  tools: Record<string, boolean>;
  phase: RunPhase;
  runId: string;
  progress: ScaffoldProgress | null;
  log: string[];
  error: string | null;
  project: Project | null;
}

export type WizardAction =
  | { type: 'go'; step: CreateStep }
  | { type: 'back' }
  | { type: 'chooseKind'; kind: ProjectKind | null }
  | { type: 'chooseTemplate'; templateId: string | null }
  | { type: 'toggleExtra'; templateId: string }
  | { type: 'continue' }
  | { type: 'browseAll'; on: boolean }
  | { type: 'setOptions'; patch: Partial<TemplateOptions> }
  | { type: 'setName'; name: string }
  | { type: 'setParent'; parent: string }
  | { type: 'preflight'; tools: Record<string, boolean>; home: string; parent: string; projectPaths: string[] }
  | { type: 'run'; patch: Partial<Pick<WizardState, 'phase' | 'progress' | 'error' | 'project'>> }
  | { type: 'log'; lines: string[] }
  | { type: 'restart' }
  | { type: 'reset'; runId: string };

const LOG_LINES = 400;

export function initialWizard(runId: string): WizardState {
  return { step: 'kind', history: [], kind: null, templateId: null, extraIds: [], options: DEFAULT_TEMPLATE_OPTIONS, home: '',
    parent: '', name: 'untitled', browsing: false, tools: {}, phase: 'idle', runId, progress: null, log: [],
    error: null, project: null };
}

const go = (state: WizardState, step: CreateStep): WizardState =>
  ({ ...state, step, history: [...state.history, state.step] });

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'go': return go(state, action.step);
    case 'back': {
      const history = [...state.history];
      const previous = history.pop();
      return previous ? { ...state, step: previous, history } : state;
    }
    case 'chooseKind':
      return go({ ...state, kind: action.kind, browsing: false, extraIds: [],
        templateId: action.kind === 'empty' ? 'empty' : null }, stepAfterKind(action.kind));
    case 'chooseTemplate': {
      // Picking the base no longer moves on by itself: more than one stack can
      // be chosen here, so leaving the step is the person's own decision.
      // Skipping the question is still an answer, and still moves on.
      const next = { ...state, templateId: action.templateId, extraIds: state.extraIds.filter(id => id !== action.templateId),
        kind: kindForTemplate(state.kind, action.templateId) };
      return action.templateId === null ? go({ ...next, extraIds: [] }, stepAfterStack()) : next;
    }
    case 'toggleExtra': {
      const on = state.extraIds.includes(action.templateId);
      return { ...state, extraIds: on ? state.extraIds.filter(id => id !== action.templateId)
        : [...state.extraIds, action.templateId] };
    }
    case 'continue': return go({ ...state, browsing: false }, stepAfterStack());
    case 'browseAll': return { ...state, browsing: action.on };
    case 'setOptions': return { ...state, options: { ...state.options, ...action.patch } };
    case 'setName': return { ...state, name: action.name };
    case 'setParent': return { ...state, parent: action.parent };
    case 'preflight': {
      // The parent the computer suggests only fills an empty field: a folder
      // already typed is not replaced by a late answer.
      const parent = state.parent || action.parent;
      const name = state.name === 'untitled' ? suggestedName(action.projectPaths, parent) : state.name;
      return { ...state, tools: action.tools, home: action.home, parent, name };
    }
    case 'run': return { ...state, ...action.patch };
    case 'log': {
      const log = [...state.log, ...action.lines];
      return { ...state, log: log.length > LOG_LINES ? log.slice(log.length - LOG_LINES) : log };
    }
    case 'restart':
      return { ...state, phase: 'idle', progress: null, log: [], error: null, project: null };
    case 'reset': return initialWizard(action.runId);
  }
}

/** A run id the computer accepts: letters, digits and dashes, under 64 of them. */
export function newRunId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
