import type { ResolvedAgent } from "../types";
import { inspectSafeWorkspace } from "../ipc/workspace";
import { useLaunchApprovalStore } from "../state/launchApprovalStore";
import {
  useLaunchSettingsStore,
  type LaunchEffort,
} from "../state/launchSettingsStore";
import { useSettingsStore } from "../state/settingsStore";
import { useTerminalStore } from "../state/terminalStore";
import { useWorkspaceStore } from "../state/workspaceStore";

interface LaunchOptions {
  model?: string | null;
  reasoningEffort?: LaunchEffort;
  reasoningEnabled?: boolean;
  title?: string;
  /**
   * Terminals to open. Defaults to one: the project's `terminalCount`
   * preference belongs to the Launch setup button that spells it out
   * ("Launch 4 terminals"), and must not be inherited by the picker or the
   * quick chips, where a single click reads as a single terminal.
   */
  count?: number;
}

interface PreparedLaunch {
  agent: ResolvedAgent;
  projectId: string;
  projectRoot: string;
  count: number;
  model: string | null;
  permissionMode: "standard" | "full";
  reasoningEffort: LaunchEffort | null;
  title?: string;
  safeMode: boolean;
}

const FULL_ACCESS_AGENTS = new Set(["claude", "codex", "gemini"]);

// Mirrors the backend's add_reasoning_effort matrix: passing an effort to any
// other agent (plain terminals included) makes the whole launch error out.
const EFFORT_AGENTS = new Set(["claude", "codex"]);

// A shell (or ssh session) is unrestricted by nature — the Full access toggle
// neither applies nor should block launching one.
const PLAIN_TERMINALS = new Set(["shell", "ssh"]);

function supportsFullAccess(agentId: string): boolean {
  return FULL_ACCESS_AGENTS.has(agentId);
}

async function runLaunch(launch: PreparedLaunch, fingerprint?: string): Promise<void> {
  for (let index = 0; index < launch.count; index += 1) {
    const launched = await useTerminalStore.getState().spawnAgent(launch.agent, launch.projectId, {
      cwd: launch.projectRoot,
      model: launch.model,
      permissionMode: launch.permissionMode,
      reasoningEffort: launch.reasoningEffort,
      title: launch.title,
      workspaceMode: launch.safeMode ? "safe" : "shared",
      safeSnapshotFingerprint: fingerprint,
    });
    if (!launched) break;
  }
}

/** Applies the current project's launch contract to quick and picker launches. */
export async function launchConfigured(
  agent: ResolvedAgent,
  projectId: string,
  options: LaunchOptions = {},
): Promise<void> {
  const preferences = useLaunchSettingsStore.getState().get(projectId);
  const project = useSettingsStore
    .getState()
    .settings?.projects.find((candidate) => candidate.id === projectId);

  if (!project) {
    useWorkspaceStore.getState().setError("This project is no longer available");
    return;
  }
  if (preferences.tokenSource === "vibyra") {
    useWorkspaceStore
      .getState()
      .setError("Vibyra-token terminals are not connected in this native preview yet. Choose My AI accounts.");
    return;
  }
  if (
    preferences.permission === "full" &&
    !supportsFullAccess(agent.id) &&
    !PLAIN_TERMINALS.has(agent.id)
  ) {
    useWorkspaceStore
      .getState()
      .setError(`${agent.name} does not expose a verified Full access launch mode`);
    return;
  }

  const launch: PreparedLaunch = {
    agent,
    projectId,
    projectRoot: project.root,
    count: Math.max(1, Math.min(12, Math.round(options.count ?? 1))),
    model: options.model ?? null,
    permissionMode:
      preferences.permission === "full" && supportsFullAccess(agent.id)
        ? "full"
        : "standard",
    reasoningEffort: !EFFORT_AGENTS.has(agent.id) || options.reasoningEnabled === false
      ? null
      : options.reasoningEffort ?? preferences.effort,
    title: options.title,
    safeMode: preferences.safeMode,
    // No account named here: every launcher inherits the company's account
    // chosen in Settings → Integrations, which spawn reads at launch time.
    // Only the relaunch and account-switch paths pass one explicitly, because
    // a pane keeps the login it started on.
  };
  if (!launch.safeMode) {
    await runLaunch(launch);
    return;
  }

  try {
    const preflight = await inspectSafeWorkspace(project.root);
    if (preflight.changedFiles === 0) {
      await runLaunch(launch);
      return;
    }
    useLaunchApprovalStore.getState().request({
      projectName: project.name,
      changedFiles: preflight.changedFiles,
      // Fingerprint is re-taken at click time: files changing while the
      // approval dialog is open must not strand the launch.
      continueLaunch: async () => {
        try {
          const fresh = await inspectSafeWorkspace(project.root);
          await runLaunch(launch, fresh.fingerprint);
        } catch (error) {
          useWorkspaceStore.getState().setError(safeModeError(project.name, error));
        }
      },
    });
  } catch (error) {
    useWorkspaceStore.getState().setError(safeModeError(project.name, error));
  }
}

function safeModeError(projectName: string, error: unknown): string {
  return `Safe mode can't run in ${projectName} (${String(error)}). Turn Safe mode off in Launch setup to open terminals directly in the project folder.`;
}
