// Which agents let Vibyra name the conversation, and how a pane gets its own.
//
// "Resume the last conversation here" is ambiguous the moment a project has
// two panes running the same agent: every one of them would continue the same
// conversation, and two live processes would then be appending to it. The way
// out is to stop asking for "the last one" — Claude Code accepts
// `--session-id <uuid>` at launch and `--resume <uuid>` afterwards, so a pane
// can be given its own conversation up front and name exactly that one later.
//
// Codex cannot be told an id at launch, but it accepts its generated UUID on
// resume. Native persistence captures that UUID from the live process tree.
// Gemini resumes only by recency or list index. Until Codex has written its
// rollout, both therefore start with no renderer-assigned id.

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
