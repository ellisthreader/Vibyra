import { create } from "zustand";

import { defaultParent, suggestedName } from "../lib/projectDestination";
import { kindForTemplate, stepAfterKind, stepAfterStack } from "../lib/projectCreateFlow";
import type { CreateStep } from "../lib/projectCreateFlow";
import { allRequiredTools } from "../lib/projectTemplates";
import { DEFAULT_TEMPLATE_OPTIONS } from "../lib/projectTemplateTypes";
import type { ProjectKind, TemplateOptions } from "../lib/projectTemplateTypes";
import { scaffoldPreflight } from "../ipc/scaffold";
import { useProjectStore } from "./projectStore";
import { useSettingsStore } from "./settingsStore";

export type RunPhase = "idle" | "running" | "failed" | "stalled" | "done";

export interface RunProgress {
  index: number;
  total: number;
  label: string;
}

interface ProjectCreateStore {
  open: boolean;
  step: CreateStep;
  history: CreateStep[];
  kind: ProjectKind | null;
  templateId: string | null;
  options: TemplateOptions;
  parent: string;
  name: string;
  /** Whether the stack step is showing the whole catalog rather than the
   * stacks filed under the chosen kind. */
  browsing: boolean;
  /** Executable name → on PATH. Empty until the first preflight answers. */
  tools: Record<string, boolean>;
  phase: RunPhase;
  runId: string;
  progress: RunProgress | null;
  log: string[];
  error: string | null;

  start: () => void;
  close: () => void;
  go: (step: CreateStep) => void;
  back: () => void;
  chooseKind: (kind: ProjectKind | null) => void;
  chooseTemplate: (templateId: string | null) => void;
  browseAll: (on: boolean) => void;
  setOptions: (patch: Partial<TemplateOptions>) => void;
  setName: (name: string) => void;
  setParent: (parent: string) => void;
  /** Called by `projectCreateRun`; nothing else should move the run state. */
  setRun: (patch: Partial<Pick<ProjectCreateStore, "phase" | "progress" | "error">>) => void;
  appendLog: (line: string) => void;
  clearLog: () => void;
}

const LOG_LINES = 400;

function projects() {
  return useSettingsStore.getState().settings?.projects ?? [];
}

export const useProjectCreateStore = create<ProjectCreateStore>((set, get) => ({
  open: false,
  step: "start",
  history: [],
  kind: null,
  templateId: null,
  options: DEFAULT_TEMPLATE_OPTIONS,
  parent: "",
  name: "",
  browsing: false,
  tools: {},
  phase: "idle",
  runId: "",
  progress: null,
  log: [],
  error: null,

  start: () => {
    const homeDir = useProjectStore.getState().homeDir;
    const parent = defaultParent(projects(), homeDir);
    set({
      open: true,
      step: "start",
      history: [],
      kind: null,
      templateId: null,
      options: DEFAULT_TEMPLATE_OPTIONS,
      browsing: false,
      parent,
      name: suggestedName(projects(), parent),
      phase: "idle",
      runId: `s-${Date.now().toString(36)}`,
      progress: null,
      log: [],
      error: null,
    });
    void scaffoldPreflight(allRequiredTools())
      .then((tools) => set({ tools }))
      .catch(() => {});
  },

  close: () => set({ open: false }),

  go: (step) => set((state) => ({ step, history: [...state.history, state.step] })),

  back: () => set((state) => {
    const history = [...state.history];
    const previous = history.pop();
    return previous ? { step: previous, history } : {};
  }),

  chooseKind: (kind) => {
    set({ kind, browsing: false, templateId: kind === "empty" ? "empty" : null });
    get().go(stepAfterKind(kind));
  },

  chooseTemplate: (templateId) => {
    set({ templateId, kind: kindForTemplate(get().kind, templateId) });
    get().go(stepAfterStack(templateId));
  },

  browseAll: (on) => set({ browsing: on }),

  setOptions: (patch) => set((state) => ({ options: { ...state.options, ...patch } })),
  setName: (name) => set({ name }),
  setParent: (parent) => set({ parent }),
  setRun: (patch) => set(patch),
  clearLog: () => set({ log: [] }),
  appendLog: (line) => set((state) => ({
    log: state.log.length >= LOG_LINES
      ? [...state.log.slice(state.log.length - LOG_LINES + 1), line]
      : [...state.log, line],
  })),
}));
