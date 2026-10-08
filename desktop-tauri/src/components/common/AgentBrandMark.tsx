import { AgentMark } from "./AgentMark";

/**
 * A company mark for an agent, preferring a real brand logo.
 *
 * `AgentMark` already resolves the checksummed provider logos the app ships
 * (OpenAI, Anthropic, Google, Qwen) and falls back to a tinted letter tile.
 * What it cannot do is cover a company whose mark is not in that asset set,
 * so the few that matter here are drawn inline — the same way
 * `IntegrationLogo.tsx` draws GitHub and Obsidian, and for the same reasons:
 * they render offline and in both themes.
 *
 * Only marks that are genuinely the company's are drawn. Anything else keeps
 * the letter tile, which is the app's designed fallback rather than a gap —
 * inventing a logo for a brand is worse than not showing one.
 */
const DRAWN: Record<string, { viewBox: string; path: string; fill?: string }> = {
  // GitHub's mark, as already used by the Integrations group.
  copilot: {
    viewBox: "0 0 16 16",
    path: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z",
  },
};

export function AgentBrandMark({
  agentId,
  name,
  accent,
  size = 24,
}: {
  agentId: string;
  name: string;
  accent: string;
  size?: number;
}) {
  const drawn = DRAWN[agentId];
  if (!drawn) return <AgentMark agentId={agentId} name={name} accent={accent} size={size} />;
  return (
    <span
      className="agent-mark agent-mark--brand"
      style={{ width: size, height: size, "--mark-accent": accent } as React.CSSProperties}
      aria-hidden="true"
    >
      <svg
        viewBox={drawn.viewBox}
        width={Math.round(size * 0.66)}
        height={Math.round(size * 0.66)}
        fill={drawn.fill ?? "currentColor"}
      >
        <path d={drawn.path} />
      </svg>
    </span>
  );
}
