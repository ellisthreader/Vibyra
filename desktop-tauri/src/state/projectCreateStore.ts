import { create } from "zustand";
import { useShallow } from "zustand/shallow";

import { defaultParent, suggestedName } from "../lib/projectDestination";
import { plannedProject, type PlannedProject } from "../lib/projectCreatePlan";
import { kindForTemplate, stepAfterKind, stepAfterStack } from "../lib/projectCreateFlow";
import type { CreateStep } from "../lib/projectCreateFlow";
import { allRequiredTools } from "../lib/projectTemplates";
import { DEFAULT_TEMPLATE_OPTIONS } from "../lib/projectTemplateTypes";
import type { ProjectKind, TemplateOptions } from "../lib/projectTemplateTypes";
import { scaffoldPreflight } from "../ipc/scaffold";
import { useProjectStore } from "./projectStore";
import { useSettingsStore } from "./settingsStore";

/**
 * The wizard's answers, which screen is showing and the way back, plus the
 * build once it starts. The phone keeps the same machine as a reducer in
 * `mobile/src/scaffold/wizard.ts`; this is the window's zustand copy.
 */
export type RunPhase = "idle" | "running" | "failed" | "stalled" | "done";

export interface RunProgress {
  index: number;
  total: number;
  label: string;
}

interface ProjectCreateStore {
  step: CreateStep;
  history: CreateStep[];
  kind: ProjectKind | null;
  /** The stack that makes the project. Exactly one, because only one
   *  scaffolder can own a new folder. */
  templateId: string | null;
  /** Stacks layered on top of it, in the order they were picked. */
  extraIds: string[];
  options: TemplateOptions;
  parent: string;
  name: string;
  /** The stack step is showing the whole catalog rather than the chosen kind's. */
  browsing: boolean;
  /** Create the project on GitHub too. Desktop-only, so it is wizard state
   *  rather than a `TemplateOptions` field the phone's catalog would inherit. */
  github: boolean;
  /** Executable name → on PATH. Empty until the first preflight answers. */
  tools: Record<string, boolean>;
  phase: RunPhase;
  runId: string;
  progress: RunProgress | null;
  log: string[];
  error: string | null;

  start: () => void;
  go: (step: CreateStep) => void;
  back: () => void;
  chooseKind: (kind: ProjectKind | null) => void;
  chooseTemplate: (templateId: string | null) => void;
  toggleExtra: (templateId: string) => void;
  continueStack: () => void;
  browseAll: (on: boolean) => void;
  setOptions: (patch: Partial<TemplateOptions>) => void;
  setName: (name: string) => void;
  setParent: (parent: string) => void;
  setGithub: (on: boolean) => void;
  /** Called by `projectCreateRun`; nothing else should move the run state. */
  setRun: (patch: Partial<Pick<ProjectCreateStore, "phase" | "progress" | "error">>) => void;
  appendLog: (line: string) => void;
  restart: () => void;
}

const LOG_LINES = 400;

function projectRoots(): string[] {
  return (useSettingsStore.getState().settings?.projects ?? []).map((project) => project.root);
}

/** A run id Rust accepts: letters, digits and dashes, under 64 of them. */
function newRunId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useProjectCreateStore = create<ProjectCreateStore>((set, get) => ({
  step: "start",
  history: [],
  kind: null,
  templateId: null,
  extraIds: [],
  options: DEFAULT_TEMPLATE_OPTIONS,
  parent: "",
  name: "untitled",
  browsing: false,
  github: false,
  tools: {},
  phase: "idle",
  runId: "",
  progress: null,
  log: [],
  error: null,

  start: () => {
    // A build outlives the page it was started from, so reopening while one is
    // running shows it as it stands rather than throwing it away.
    if (get().phase === "running") return;
    const roots = projectRoots();
    const parent = defaultParent(roots, useProjectStore.getState().homeDir);
    set({
      step: "start",
      history: [],
      kind: null,
      templateId: null,
      extraIds: [],
      options: DEFAULT_TEMPLATE_OPTIONS,
      browsing: false,
      github: false,
      parent,
      name: suggestedName(roots, parent),
      phase: "idle",
      runId: newRunId(),
      progress: null,
      log: [],
      error: null,
    });
    void scaffoldPreflight(allRequiredTools())
      .then((tools) => set({ tools }))
      .catch(() => {});
  },

  go: (step) => set((state) => ({ step, history: [...state.history, state.step] })),

  back: () => set((state) => {
    const history = [...state.history];
    const previous = history.pop();
    return previous ? { step: previous, history } : {};
  }),

  chooseKind: (kind) => {
    set({ kind, browsing: false, extraIds: [], templateId: kind === "empty" ? "empty" : null });
    get().go(stepAfterKind(kind));
  },

  chooseTemplate: (templateId) => {
    // Picking the base no longer moves on by itself: more than one stack can be
    // chosen here, so leaving the step is the person's own decision. Skipping
    // the question is still an answer, and still moves on.
    set((state) => ({
      templateId,
      extraIds: templateId === null ? [] : state.extraIds.filter((id) => id !== templateId),
      kind: kindForTemplate(state.kind, templateId),
    }));
    if (templateId === null) get().go(stepAfterStack());
  },

  toggleExtra: (templateId) => set((state) => ({
    extraIds: state.extraIds.includes(templateId)
      ? state.extraIds.filter((id) => id !== templateId)
      : [...state.extraIds, templateId],
  })),

  continueStack: () => {
    set({ browsing: false });
    get().go(stepAfterStack());
  },

  browseAll: (on) => set({ browsing: on }),
  setOptions: (patch) => set((state) => ({ options: { ...state.options, ...patch } })),
  setName: (name) => set({ name }),
  setParent: (parent) => set({ parent }),
  setGithub: (github) => set({ github }),
  setRun: (patch) => set(patch),
  restart: () => set({ phase: "idle", progress: null, log: [], error: null }),
  appendLog: (line) => set((state) => ({
    log: state.log.length >= LOG_LINES
      ? [...state.log.slice(state.log.length - LOG_LINES + 1), line]
      : [...state.log, line],
  })),
}));

/**
 * What the answers so far add up to, recomputed whenever one of them changes.
 * A hook rather than a plain read: the naming screen shows the resolved path
 * while it is being typed, and a plan read once per page render would show the
 * previous keystroke's answer.
 */
export function usePlannedProject(): PlannedProject {
  const home = useProjectStore((state) => state.homeDir);
  const answers = useProjectCreateStore(useShallow((state) => ({
    templateId: state.templateId,
    extraIds: state.extraIds,
    parent: state.parent,
    name: state.name,
    options: state.options,
  })));
  return plannedProject({ ...answers, home });
}
