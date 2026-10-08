// Claude can pin a conversation before launch. Codex assigns its own UUID,
// discovered by sessionIdentity.ts on Mac. Unknown IDs use a provider chooser.

const PINNABLE_AGENTS = new Set(["claude"]);

/**
 * A conversation id for a new pane, or null for an agent that cannot take one.
 *
 * Shape matters: it is passed to the agent as an argument, and Rust rejects
 * anything that is not a plain UUID rather than let it reach a command line.
 */
export function newAgentSessionId(agentId: string): string | null {
  if (!PINNABLE_AGENTS.has(agentId)) return null;
  return randomUuid();
}

function randomUuid(): string {
  // Available in the Tauri webview, which is a secure context. The fallback is
  // for a stripped runtime rather than an expected path.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
