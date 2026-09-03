import type { Engine } from "../agentTypes";

/** The product name behind an engine id, everywhere one is shown. */
export function engineLabel(engine: Engine): string {
  return engine === "claude" ? "Claude Code" : "Codex";
}
