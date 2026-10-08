import { scaffoldCancel, scaffoldRun } from "../ipc/scaffold";
import { useAgentStore } from "../state/agentStore";
import { useNotificationStore } from "../state/notificationStore";
import { useProjectCreateStore } from "../state/projectCreateStore";
import { useProjectStore } from "../state/projectStore";
import { closeNewProject } from "../state/newProject";
import { launchConfigured } from "./configuredLaunch";
import { createGithubRepository, githubPublish } from "./githubPublish";
import { plannedProject, type PlannedProject } from "./projectCreatePlan";
import { slugify } from "./projectDestination";
import type { ProjectTemplate } from "./projectTemplateTypes";

// The build itself. Kept out of the store so the store stays a state machine
// and this stays the one place that talks to Rust, settings and terminals.

/** The plan as the answers currently stand, for the two places here that act
 *  on it. Screens use `usePlannedProject`, which re-reads as they are typed. */
function plannedNow(): PlannedProject {
  const state = useProjectCreateStore.getState();
  return plannedProject({
    templateId: state.templateId,
    extraIds: state.extraIds,
    parent: state.parent,
    name: state.name,
    home: useProjectStore.getState().homeDir,
    options: state.options,
  });
}

export async function runProjectCreate(): Promise<void> {
  const store = useProjectCreateStore.getState();
  const { destination, request, entry } = plannedNow();
  if (destination.error) {
    store.setRun({ phase: "failed", error: destination.error });
    return;
  }
  store.restart();
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
  if (live.github && !(await publishToGithub(destination.path, live.name))) return;
  const after = useProjectCreateStore.getState();
  after.setRun({ phase: "done", progress: null });
  await adoptProject(destination.path, after.name, entry);
}

/**
 * The repository, then the push. Reported as its own run of steps so the build
 * ring keeps counting rather than appearing to finish and then hang.
 *
 * A failure here leaves a project that is perfectly fine on this computer, so
 * it stops at the failed screen with the reason: the folder is still offered,
 * and pushing it later is one ordinary git command away.
 */
async function publishToGithub(path: string, name: string): Promise<boolean> {
  const store = useProjectCreateStore.getState();
  store.setRun({ progress: { index: 0, total: 6, label: "Creating the GitHub repository" } });
  try {
    const repository = await createGithubRepository(slugify(name), true);
    store.appendLog(`Created ${repository.fullName}`);
    const outcome = await githubPublish(store.runId, path, repository, (event) => {
      const live = useProjectCreateStore.getState();
      if (event.type === "step") {
        live.setRun({ progress: { index: event.index, total: event.total, label: event.label } });
      } else {
        live.appendLog(event.data);
      }
    });
    if (outcome.ok) {
      useProjectCreateStore.getState().appendLog(`Pushed to ${repository.htmlUrl}`);
      return true;
    }
    useProjectCreateStore.getState().setRun({
      phase: outcome.stalled ? "stalled" : "failed",
      error: outcome.message ?? "The project was built but could not be pushed to GitHub.",
    });
  } catch (failure) {
    useProjectCreateStore.getState().setRun({
      phase: "failed",
      error: `The project was built, but GitHub refused: ${String(failure)}`,
    });
  }
  return false;
}

/** Registers the finished folder, then gets out of the way. */
async function adoptProject(path: string, name: string, entry: ProjectTemplate): Promise<void> {
  const openTerminal = useProjectCreateStore.getState().options.openTerminal;
  const project = await useProjectStore.getState().create(path, name);
  closeNewProject();
  if (!project) return;
  useNotificationStore.getState().push({
    category: "system",
    severity: "success",
    title: `${project.name} is ready`,
    body: entry.id === "empty" ? undefined : `Built with ${entry.name}.`,
    // The window is in front — the build was just watched in it.
    osEligible: false,
  });
  if (openTerminal) openShell(project.id);
}

function openShell(projectId: string): void {
  const shell = useAgentStore.getState().agents.find((agent) => agent.id === "shell");
  if (shell?.installed) void launchConfigured(shell, projectId);
}

export function cancelProjectCreate(): void {
  void scaffoldCancel(useProjectCreateStore.getState().runId).catch(() => {});
}

/** Adopts the folder as it stands — after a stall, so the scaffolder can be
 *  finished in a terminal that has a stdin, or after a partial failure. */
export function adoptAsIs(withTerminal: boolean): void {
  const { name } = useProjectCreateStore.getState();
  const { destination } = plannedNow();
  if (!destination.path) return;
  void useProjectStore.getState().create(destination.path, name).then((project) => {
    closeNewProject();
    if (project && withTerminal) openShell(project.id);
  });
}
