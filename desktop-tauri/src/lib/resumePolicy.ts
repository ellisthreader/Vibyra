import type { PaneState } from "../state/terminalStoreTypes";

export function resumableAgent(agentId: string): boolean {
  return ["claude", "codex", "gemini"].includes(agentId);
}

/** The default account was historically recorded as either null or 'default'. */
export function conversationInUse(pane: PaneState, siblings: PaneState[], pending: number[] = []): boolean {
  if (!pane.agentSessionId) return false;
  return siblings.some((other) => other.id !== pane.id && (other.status === "running" || pending.includes(other.id))
    && other.agentId === pane.agentId && other.agentSessionId === pane.agentSessionId
    && (other.accountId ?? "default") === (pane.accountId ?? "default"));
}

export function recoveryCopy(pane: PaneState): { title: string; detail: string; action: string } {
  if (!resumableAgent(pane.agentId)) return {
    title: pane.agentId === "ssh" ? "Ready to reconnect" : "Ready when you are",
    detail: "Your saved output is here. Opening this terminal starts a new process in its project folder.",
    action: pane.agentId === "ssh" ? "Reconnect" : "Open terminal",
  };
  if (pane.agentSessionId) return {
    title: pane.status === "exited" ? "Pick up the conversation" : "Your chat is saved",
    detail: "Continue this conversation with the same account and workspace.",
    action: "Resume chat",
  };
  if (pane.agentId === "gemini") return {
    title: "Choose your saved Gemini chat",
    detail: "This older pane has no chat ID. Open Gemini, then type /resume to select the conversation.",
    action: "Open Gemini",
  };
  return {
    title: "Choose where to continue",
    detail: "This pane has no saved chat ID. Choose the conversation in the next screen.",
    action: "Choose saved chat",
  };
}
