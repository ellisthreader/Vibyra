import { AgentMark } from "./AgentMark";

/** An agent as its company's own logo (OpenAI for Codex, Anthropic for Claude
 * Code, Google for Gemini) on a quiet neutral tile. Shell and SSH keep their
 * glyphs; an unknown agent falls back to its letter. */
export function AgentLogo({ agentId, name, size, className = "" }: { agentId: string; name: string; size: number; className?: string }) {
  return <span className={`agent-logo ${className}`} style={{ width: size, height: size }} aria-hidden="true">
    <AgentMark agentId={agentId} name={name} accent="var(--muted)" size={Math.round(size * 0.8)} />
  </span>;
}
