import { resolveLaunchAccount } from "./resolveLaunchAccount";
import type { ResolvedAgent } from "../types";
import { launchConversationTerminal } from "./launchConversationTerminal";
import { launchRoute, type AgentView } from "./launchRoute";
import { inspectSafeWorkspace, safeWorkspaceSupported } from "../ipc/workspace";
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
  /** Overrides Launch setup when asked ("full permissions"); still only where supported. */
  permissionMode?: "standard" | "full";
  title?: string;
  /**
   * Terminals to open. Defaults to one: the project's `terminalCount`
   * preference belongs to the Launch setup button that spells it out
   * ("Launch 4 terminals"), and must not be inherited by the picker or the
   * quick chips, where a single click reads as a single terminal.
   */
  count?: number;
  /**
   * Which presentation the launch is for, when it is not this Mac's own
   * Settings > General > Agent view. A phone asks for Chat: its page is the
   * conversation itself, so a Claude or Gemini launch it asked for must run
   * through the conversation engine, never a PTY it can only watch.
   */
  view?: AgentView;
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
  accountId: string | null;
  view?: AgentView;
}

/** What one launch opened: a pane of this window's, or a shared chat. */
export type LaunchedSession = { paneId: number } | { conversationId: string };

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

async function runLaunch(launch: PreparedLaunch, fingerprint?: string): Promise<LaunchedSession[]> {
  // Terminal view opens the agent's own CLI; Chat view opens a conversation.
  // Codex is the one provider whose CLI can attach to its conversation.
  const view = launch.view ?? useSettingsStore.getState().settings?.agentView ?? "terminal";
  const route = launchRoute(launch.agent.id, view);
  const started: LaunchedSession[] = [];
  for (let index = 0; index < launch.count; index += 1) {
    if (route === "conversation") {
      try {
        const conversationId = await launchConversationTerminal(launch.projectId, launch.accountId, launch.title ?? launch.agent.name, {
          provider: launch.agent.id,
          model: launch.model,
          reasoningEffort: launch.reasoningEffort,
          permissionMode: launch.permissionMode,
          workspaceMode: launch.safeMode ? "safe" : "shared",
          safeSnapshotFingerprint: fingerprint,
        });
        started.push({ conversationId });
      } catch (error) {
        useWorkspaceStore.getState().setError(String(error));
        break;
      }
      continue;
    }
    const paneId = await useTerminalStore.getState().spawnAgent(launch.agent, launch.projectId, {
      cwd: launch.projectRoot,
      model: launch.model,
      permissionMode: launch.permissionMode,
      reasoningEffort: launch.reasoningEffort,
      title: launch.title,
      accountId: launch.accountId,
      workspaceMode: launch.safeMode ? "safe" : "shared",
      safeSnapshotFingerprint: fingerprint,
    });
    if (paneId === null) break;
    started.push({ paneId });
  }
  return started;
}

/**
 * Applies the current project's launch contract to quick and picker launches.
 * Resolves to what was opened; empty when nothing was, because the launch was
 * refused (the reason is on the workspace banner) or because Safe mode is
 * waiting for the person to approve a checkpoint first.
 */
export async function launchConfigured(
  agent: ResolvedAgent,
  projectId: string,
  options: LaunchOptions = {},
): Promise<LaunchedSession[]> {
  const preferences = useLaunchSettingsStore.getState().get(projectId);
  const project = useSettingsStore
    .getState()
    .settings?.projects.find((candidate) => candidate.id === projectId);

  if (!project) {
    useWorkspaceStore.getState().setError("This project is no longer available");
    return [];
  }
  if (preferences.tokenSource === "vibyra" && !PLAIN_TERMINALS.has(agent.id)) {
    useWorkspaceStore
      .getState()
      .setError("Vibyra-token terminals are not connected in this native preview yet. Choose My AI accounts.");
    return [];
  }
  const permission = options.permissionMode ?? preferences.permission;
  if (permission === "full" && !supportsFullAccess(agent.id) && !PLAIN_TERMINALS.has(agent.id)) {
    useWorkspaceStore
      .getState()
      .setError(`${agent.name} does not expose a verified Full access launch mode`);
    return [];
  }

  const launch: PreparedLaunch = {
    agent,
    projectId,
    projectRoot: project.root,
    count: Math.max(1, Math.min(12, Math.round(options.count ?? 1))),
    model: options.model ?? null,
    permissionMode:
      permission === "full" && supportsFullAccess(agent.id)
        ? "full"
        : "standard",
    reasoningEffort: !EFFORT_AGENTS.has(agent.id) || options.reasoningEnabled === false
      ? null
      : options.reasoningEffort ?? preferences.effort,
    title: options.title,
    safeMode: preferences.safeMode,
    // Which login this terminal runs as. Only account-backed CLIs have one;
    // a shell or an OpenRouter runner has no provider folder to point at.
    accountId: resolveLaunchAccount(agent.id, preferences.accountByProvider[agent.id]),
    view: options.view,
  };
  if (!launch.safeMode) return runLaunch(launch);

  try {
    // Safe mode branches from Git. A plain folder has nothing to branch from,
    // and Launch setup shows the switch as unavailable there, so the terminal
    // opens in the folder itself instead of failing on a raw `git` fatal.
    if (!(await safeWorkspaceSupported(project.root))) {
      return runLaunch({ ...launch, safeMode: false });
    }
    const preflight = await inspectSafeWorkspace(project.root);
    if (preflight.changedFiles === 0) return runLaunch(launch);
    useLaunchApprovalStore.getState().request({
      projectName: project.name,
      changedFiles: preflight.changedFiles,
      workerCount: launch.count,
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
  return [];
}

function safeModeError(projectName: string, error: unknown): string {
  return `Safe mode can't run in ${projectName} (${String(error)}). Turn Safe mode off in Launch setup to open terminals directly in the project folder.`;
}
