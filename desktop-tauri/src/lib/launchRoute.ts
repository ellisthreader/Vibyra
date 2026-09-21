export type AgentView = "terminal" | "chat";
export type LaunchRoute = "conversation" | "pty";

/** Providers the shared conversation engine can run. */
const CONVERSATION_AGENTS = new Set(["codex", "claude", "gemini"]);

/**
 * Where a launch goes for the current Settings > General > Agent view.
 *
 * Codex always runs through the shared conversation engine: in Terminal view
 * the stock Codex CLI attaches to that same thread, so the pane is the genuine
 * TUI and the iPhone follows the conversation. Claude and Gemini have no such
 * attachment, so in Terminal view they open their own CLI in a real PTY; only
 * Chat view sends them through the conversation engine. Everything else
 * (shell, ssh, aider, custom runners) is always a PTY.
 */
export function launchRoute(agentId: string, view: AgentView): LaunchRoute {
  if (agentId === "codex") return "conversation";
  if (view === "chat" && CONVERSATION_AGENTS.has(agentId)) return "conversation";
  return "pty";
}
