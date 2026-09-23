import { useAgentStore } from "../state/agentStore";
import { useTerminalStore } from "../state/terminalStore";

/**
 * Opens a plain shell for a project, for Run and nothing else.
 *
 * Deliberately not `launchConfigured`: it answers `[]` to three different
 * outcomes the caller cannot tell apart — the project is gone, the launch was
 * refused, or Safe mode is waiting behind `LaunchApprovalModal` — so a Run
 * button routed through it can silently do nothing. Safe mode would also land
 * the terminal in a worktree *copy*, and a command written about the files the
 * brief described has to run on those files.
 */
export type ShellLaunch =
  | { ok: true; paneId: number }
  | { ok: false; reason: "no-shell" | "spawn-failed" };

/** How long the rc files usually need to draw a first prompt. A heuristic,
 *  not a guarantee: a slow `.zshrc` can still swallow the first keystrokes. */
const PROMPT_SETTLE_MS = 300;

export async function openProjectShell(projectId: string): Promise<ShellLaunch> {
  const shell = useAgentStore.getState().agents.find((agent) => agent.id === "shell");
  if (!shell?.installed) return { ok: false, reason: "no-shell" };
  // `spawnAgent` defaults cwd to the project's own root and reports its own
  // failures on the workspace banner, returning null.
  const paneId = await useTerminalStore.getState().spawnAgent(shell, projectId);
  if (paneId === null) return { ok: false, reason: "spawn-failed" };
  await new Promise((resolve) => setTimeout(resolve, PROMPT_SETTLE_MS));
  return { ok: true, paneId };
}
