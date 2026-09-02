import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";

import { fsHomeDir, unwatchWorkspace, watchWorkspace } from "../ipc/fs";
import { stopProjectPreviews } from "../ipc/preview";
import { setTerminalVisibility } from "../ipc/terminal";
import {
  applyProjectVisibility,
  enterProjectHome,
  projectRuntimeTransitions,
  syncProjectVisibility,
} from "../lib/projectTransitions";
import { basename, nextProjectColor, PROJECT_COLORS } from "../lib/projectIdentity";
import type { ProjectSpec } from "../types";
import { useSettingsStore } from "./settingsStore";
import { useTerminalStore } from "./terminalStore";
import { useWorkspaceStore } from "./workspaceStore";

export type AppView = "home" | "project";

interface ProjectStore {
  view: AppView;
  activeId: string | null;
  homeDir: string;
  init: () => Promise<void>;
  create: (root: string, name?: string, templateId?: string) => Promise<ProjectSpec | null>;
  /** Native folder picker → project. The one-gesture "new project". */
  pickAndCreate: () => Promise<void>;
  activate: (id: string) => Promise<void>;
  goHome: () => Promise<void>;
  updateProject: (id: string, patch: Pick<ProjectSpec, "name" | "color">) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function projects(): ProjectSpec[] {
  return useSettingsStore.getState().settings?.projects ?? [];
}

async function persist(next: ProjectSpec[], activeId: string | null): Promise<boolean> {
  try {
    await useSettingsStore.getState().update({ projects: next, activeProjectId: activeId });
    return true;
  } catch {
    useWorkspaceStore.getState().setError("Vibyra could not save project changes.");
    return false;
  }
}

/** Point the file tree + watcher at the project root (never watch $HOME). */
async function adoptRoot(root: string, homeDir: string): Promise<void> {
  useWorkspaceStore.setState({ root, fsVersion: useWorkspaceStore.getState().fsVersion + 1 });
  await unwatchWorkspace().catch(() => {});
  if (root !== homeDir) {
    await watchWorkspace(root).catch(() => {});
  }
}

/** Rust pauses hidden terminals; revealing one resyncs its bounded ring. */
async function orchestrateVisibility(activeId: string | null): Promise<void> {
  const { panes } = useTerminalStore.getState();
  const applied = await syncProjectVisibility(panes, activeId, setTerminalVisibility);
  useTerminalStore.setState((state) => ({
    zoomedId: null,
    panes: applyProjectVisibility(state.panes, applied),
  }));
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  const goHomeNow = async (): Promise<void> => {
    const active = projects().find((project) => project.id === get().activeId);
    await enterProjectHome({
      activeRoot: active?.root ?? null,
      hideTerminals: () => orchestrateVisibility(null),
      stopPreviews: stopProjectPreviews,
      stopWatcher: unwatchWorkspace,
      clearWorkspace: () =>
        useWorkspaceStore.setState({ root: null, dockSize: "compact", preview: null }),
      showHome: () => set({ view: "home" }),
    });
  };

  const activateNow = async (id: string): Promise<void> => {
    const list = projects();
    const project = list.find((entry) => entry.id === id);
    if (!project) return;
    const previous = list.find((entry) => entry.id === get().activeId);
    if (previous && previous.id !== id) {
      await stopProjectPreviews(previous.root).catch(() => {});
    }
    useWorkspaceStore.setState({ dockSize: "compact", preview: null });
    set({ activeId: id, view: "project" });
    const touched = list.map((entry) =>
      entry.id === id ? { ...entry, lastOpenedMs: Date.now() } : entry,
    );
    await orchestrateVisibility(id);
    await adoptRoot(project.root, get().homeDir);
    await persist(touched, id);
  };

  return {
    view: "home",
    activeId: null,
    homeDir: "/",

    init: () => projectRuntimeTransitions.run(async () => {
      const homeDir = await fsHomeDir();
      set({ homeDir });
      await goHomeNow();
      const settings = useSettingsStore.getState().settings;
      if (!settings) return;

      let list = settings.projects ?? [];
      if (list.length === 0 && settings.workspaceRoot && settings.workspaceRoot !== homeDir) {
        const seeded: ProjectSpec = {
          id: `p-${Date.now().toString(36)}`,
          name: basename(settings.workspaceRoot),
          root: settings.workspaceRoot,
          color: PROJECT_COLORS[0],
          lastOpenedMs: Date.now(),
        };
        list = [seeded];
        await persist(list, settings.activeProjectId);
      }

      const active = list.find((project) => project.id === settings.activeProjectId) ?? null;
      if (active) set({ activeId: active.id, view: "home" });
    }),

    create: (root, name, templateId) => projectRuntimeTransitions.run(async () => {
      const trimmed = root.trim().replace(/\/+$/, "");
      if (!trimmed) return null;
      const list = projects();
      const existing = list.find((project) => project.root === trimmed);
      if (existing) {
        await activateNow(existing.id);
        return existing;
      }
      const project: ProjectSpec = {
        id: `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
        name: (name ?? "").trim() || basename(trimmed),
        root: trimmed,
        color: nextProjectColor(list),
        lastOpenedMs: Date.now(),
        ...(templateId ? { templateId, createdMs: Date.now() } : {}),
      };
      await persist([...list, project], project.id);
      await activateNow(project.id);
      return project;
    }),

    pickAndCreate: async () => {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: "Choose a project folder",
        defaultPath: get().homeDir,
      }).catch(() => null);
      if (typeof picked === "string" && picked) await get().create(picked);
    },

    activate: (id) => projectRuntimeTransitions.run(() => activateNow(id)),

    goHome: () => projectRuntimeTransitions.run(goHomeNow),

    updateProject: (id, patch) => projectRuntimeTransitions.run(async () => {
      const name = patch.name.trim();
      if (!name || !PROJECT_COLORS.includes(patch.color)) {
        throw new Error("Choose a project name and one of Vibyra's project colours.");
      }
      const current = projects();
      if (!current.some((project) => project.id === id)) {
        throw new Error("This project is no longer available.");
      }
      const next = current.map((project) =>
        project.id === id ? { ...project, name, color: patch.color } : project,
      );
      if (!(await persist(next, get().activeId))) {
        throw new Error("Project configuration could not be saved.");
      }
    }),

    remove: (id) => projectRuntimeTransitions.run(async () => {
      const current = projects();
      const project = current.find((entry) => entry.id === id);
      if (!project) throw new Error("This project is no longer available.");
      const list = current.filter((entry) => entry.id !== id);
      const removingActive = get().activeId === id;
      const activeId = removingActive ? null : get().activeId;
      if (removingActive) await goHomeNow();
      else await stopProjectPreviews(project.root).catch(() => {});
      const doomed = useTerminalStore.getState().panes.filter((pane) => pane.projectId === id);
      for (const pane of doomed) await useTerminalStore.getState().close(pane.id);
      if (!(await persist(list, activeId))) {
        throw new Error("The project could not be closed because its settings were not saved.");
      }
      set({ activeId, view: activeId ? get().view : "home" });
    }),
  };
});
