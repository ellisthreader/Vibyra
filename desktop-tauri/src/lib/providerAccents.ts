// Frontend-only accent mapping to the original Vibyra provider palette.
// Backend AgentSpec.accent stays untouched; custom agents fall through to it.

const ACCENTS: Record<string, string> = {
  shell: "#7490ff",
  claude: "#ff9b6a",
  codex: "#5b7cfa",
  gemini: "#6aa8ff",
  aider: "#55d98b",
  opencode: "#f472b6",
  qwen: "#bd8cff",
  ssh: "#e8a94b",
};

export function accentFor(agentId: string, fallback?: string): string {
  return ACCENTS[agentId] ?? (fallback || "#5b7cfa");
}
