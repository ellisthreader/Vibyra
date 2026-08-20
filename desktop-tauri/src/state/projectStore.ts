import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";

import { fsHomeDir, unwatchWorkspace, watchWorkspace } from "../ipc/fs";
import { stopProjectPreviews } from "../ipc/preview";
import { setTerminalVisibility } from "../ipc/terminal";
import type { ProjectSpec } from "../types";
import { useSettingsStore } from "./settingsStore";
import { useTerminalStore } from "./terminalStore";
import { useWorkspaceStore } from "./workspaceStore";

export type AppView = "home" | "project";

const PROJECT_COLORS = [
  "#5b7cfa",
  "#ff9b6a",
  "#37c78a",
  "#bd8cff",
  "#6aa8ff",
  "#e8a94b",
  "#f472b6",
  "#69d6c7",
];

export function basename(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || path;
}

function nextColor(existing: ProjectSpec[]): string {
  return PROJECT_COLORS[existing.length % PROJECT_COLORS.length];
}

interface ProjectStore {
  view: AppView;
  activeId: string | null;
  homeDir: string;
  init: () => Promise<void>;
  create: (root: string, name?: string) => Promise<ProjectSpec | null>;
  /** Native folder picker → project. The one-gesture "new project". */
  pickAndCreate: () => Promise<void>;
  activate: (id: string) => Promise<void>;
  goHome: () => void;
  remove: (id: string) => Promise<void>;
}

function projects(): ProjectSpec[] {
  return useSettingsStore.getState().settings?.projects ?? [];
}

async function persist(next: ProjectSpec[], activeId: string | null): Promise<void> {
  await useSettingsStore.getState().update({ projects: next, activeProjectId: activeId });
}

/** Point the file tree + watcher at the project root (never watch $HOME). */
async function adoptRoot(root: string, homeDir: string): Promise<void> {
  useWorkspaceStore.setState({ root, fsVersion: useWorkspaceStore.getState().fsVersion + 1 });
  await unwatchWorkspace().catch(() => {});
  if (root !== homeDir) {
    await watchWorkspace(root).catch(() => {});
  }
}

/** Rust throttles hidden terminals; tell it which project is on stage. */
function orchestrateVisibility(activeId: string | null): void {
  const { panes } = useTerminalStore.getState();
  for (const pane of panes) {
    if (pane.status !== "running" || pane.visibility === "hibernated") continue;
    const target = pane.projectId === activeId ? "visible" : "hidden";
    if (pane.visibility !== target) {
      void setTerminalVisibility(pane.id, target).catch(() => {});
    }
  }
  useTerminalStore.setState((state) => ({
    zoomedId: null,
    panes: state.panes.map((p) =>
      p.status !== "running" || p.visibility === "hibernated"
        ? p
        : { ...p, visibility: p.projectId === activeId ? "visible" : "hidden" },
    ),
  }));
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  view: "home",
  activeId: null,
  homeDir: "/",

  init: async () => {
    const homeDir = await fsHomeDir();
    set({ homeDir });
    const settings = useSettingsStore.getState().settings;
    if (!settings) return;

    let list = settings.projects ?? [];
    // Migration: seed a project from the pre-projects workspace root.
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

    const active = list.find((p) => p.id === settings.activeProjectId) ?? null;
    if (active) {
      set({ activeId: active.id, view: "home" });
      await adoptRoot(active.root, homeDir);
    }
  },

  create: async (root, name) => {
    const trimmed = root.trim().replace(/\/+$/, "");
    if (!trimmed) return null;
    const list = projects();
    const existing = list.find((p) => p.root === trimmed);
    if (existing) {
      await get().activate(existing.id);
      return existing;
    }
    const project: ProjectSpec = {
      id: `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
      name: (name ?? "").trim() || basename(trimmed),
      root: trimmed,
      color: nextColor(list),
      lastOpenedMs: Date.now(),
    };
    await persist([...list, project], project.id);
    await get().activate(project.id);
    return project;
  },

  pickAndCreate: async () => {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: "Choose a project folder",
      defaultPath: get().homeDir,
    }).catch(() => null);
    if (typeof picked === "string" && picked) {
      await get().create(picked);
    }
  },

  activate: async (id) => {
    const list = projects();
    const project = list.find((p) => p.id === id);
    if (!project) return;
    const previous = list.find((entry) => entry.id === get().activeId);
    if (previous && previous.id !== id) {
      await stopProjectPreviews(previous.root).catch(() => {});
    }
    useWorkspaceStore.setState({ projectMode: "terminals" });
    set({ activeId: id, view: "project" });
    const touched = list.map((p) => (p.id === id ? { ...p, lastOpenedMs: Date.now() } : p));
    void persist(touched, id);
    orchestrateVisibility(id);
    await adoptRoot(project.root, get().homeDir);
  },

  goHome: () => {
    useWorkspaceStore.setState({ projectMode: "terminals" });
    set({ view: "home" });
  },

  remove: async (id) => {
    const current = projects();
    const project = current.find((entry) => entry.id === id);
    const list = current.filter((entry) => entry.id !== id);
    const activeId = get().activeId === id ? null : get().activeId;
    if (project) await stopProjectPreviews(project.root).catch(() => {});
    // Close this project's sessions for real — its terminals lose their home.
    const doomed = useTerminalStore.getState().panes.filter((p) => p.projectId === id);
    for (const pane of doomed) {
      await useTerminalStore.getState().close(pane.id);
    }
    await persist(list, activeId);
    set({ activeId, view: activeId ? get().view : "home" });
  },
}));
