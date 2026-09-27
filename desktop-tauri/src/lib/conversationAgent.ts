import { accentFor } from "./providerAccents.ts";

const NAMES: Record<string, string> = {
  codex: "Codex",
  claude: "Claude Code",
  gemini: "Gemini",
};

/**
 * Branding for a shared conversation session, taken from the provider that
 * runs it. Sessions saved before `kind` existed were all Codex.
 */
export function conversationAgent(kind: string | undefined): { id: string; name: string; accent: string } {
  const id = kind && NAMES[kind] ? kind : "codex";
  return { id, name: NAMES[id], accent: accentFor(id) };
}
