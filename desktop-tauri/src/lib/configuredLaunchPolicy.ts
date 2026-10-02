const FULL_ACCESS_AGENTS = new Set(["claude", "codex", "gemini"]);
// Mirrors the backend's add_reasoning_effort matrix: passing an effort to any
// other agent (plain terminals included) makes the whole launch error out.
export const EFFORT_AGENTS = new Set(["claude", "codex"]);

// Full access does not apply to plain terminals.
export const PLAIN_TERMINALS = new Set(["shell", "ssh"]);

export function supportsFullAccess(agentId: string): boolean {
  return FULL_ACCESS_AGENTS.has(agentId);
}
