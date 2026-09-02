import { scaffoldCancel, scaffoldRun } from "../ipc/scaffold";
import { useAgentStore } from "../state/agentStore";
import { useNotificationStore } from "../state/notificationStore";
import { useProjectCreateStore } from "../state/projectCreateStore";
import { useProjectStore } from "../state/projectStore";
import { useTerminalStore } from "../state/terminalStore";
import { resolveDestination } from "./projectDestination";
import { buildScaffoldRequest } from "./projectTemplateCommand";
import { templateById } from "./projectTemplates";
import type { ProjectTemplate } from "./projectTemplateTypes";

// The build itself. Kept out of the store so the store stays a state machine
// and this stays the one place that talks to Rust, settings and terminals.

const EMPTY: ProjectTemplate = {
  id: "empty",
  kinds: ["empty"],
  name: "Empty project",
  blurb: "",
  requires: [],
  steps: [],
  seeds: [],
  docs: "",
};

export function plannedDestination(): { path: string; error: string | null } {
  const { parent, name } = useProjectCreateStore.getState();
  const homeDir = useProjectStore.getState().homeDir;
  const { path, error } = resolveDestination(parent, name, homeDir);
  return { path, error };
}

export function plannedRequest() {
  const state = useProjectCreateStore.getState();
  const { path } = plannedDestination();
  const entry = templateById(state.templateId) ?? EMPTY;
  return { entry, request: buildScaffoldRequest(entry, path, state.options) };
}

export async function runProjectCreate(): Promise<void> {
  const store = useProjectCreateStore.getState();
  const { path, error } = plannedDestination();
  if (error) {
    store.setRun({ phase: "failed", error });
    return;
  }
  const { entry, request } = plannedRequest();
  store.clearLog();
  if (store.step !== "running") store.go("running");
  store.setRun({ phase: "running", error: null, progress: null });
  const outcome = await scaffoldRun(store.runId, request, (event) => {
    const live = useProjectCreateStore.getState();
    if (event.type === "step") {
      live.setRun({ progress: { index: event.index, total: event.total, label: event.label } });
    } else {
      live.appendLog(event.data);
    }
  }).catch((failure) => ({ ok: false, message: String(failure), stalled: false }));

  const live = useProjectCreateStore.getState();
  if (!outcome.ok) {
    live.setRun({
      phase: outcome.stalled ? "stalled" : "failed",
      error: outcome.message ?? "The project could not be built.",
    });
    return;
  }
  live.setRun({ phase: "done", progress: null });
  await adoptProject(path, live.name, entry);
}

/** Registers the finished folder, then gets out of the way. */
async function adoptProject(path: string, name: string, entry: ProjectTemplate): Promise<void> {
  const store = useProjectCreateStore.getState();
  const project = await useProjectStore.getState().create(path, name, entry.id);
  store.close();
  if (!project) return;
  useNotificationStore.getState().push({
    kind: "project",
    tier: "done",
    title: `${project.name} is ready`,
    body: entry.id === "empty" ? undefined : `Built with ${entry.name}.`,
    osEligible: false,
  });
  if (store.options.openTerminal) openTerminal(project.id);
}

function openTerminal(projectId: string): void {
  const shell = useAgentStore.getState().agents.find((agent) => agent.id === "shell");
  if (shell?.installed) void useTerminalStore.getState().spawnAgent(shell, projectId);
}

export function cancelProjectCreate(): void {
  void scaffoldCancel(useProjectCreateStore.getState().runId).catch(() => {});
}

/** Adopts the folder as it stands — after a stall, so the user can finish the
 * scaffolder in a terminal that has a stdin, or after a partial failure. */
export function adoptAsIs(withTerminal: boolean): void {
  const store = useProjectCreateStore.getState();
  const { path } = plannedDestination();
  void useProjectStore.getState().create(path, store.name).then((project) => {
    if (project && withTerminal) openTerminal(project.id);
    store.close();
  });
}
