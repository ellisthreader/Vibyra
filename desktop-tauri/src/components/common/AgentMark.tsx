import { modelArtworkUrl } from "../../lib/modelArtwork";
import { iconForProvider, providerIconFor } from "../../lib/providerIcons";

/** A model's own artwork (GPT/Claude/Gemini sets) or its company mark. */
export function ModelMark({
  modelId,
  label,
  providerKey,
  accent,
  size = 24,
}: {
  modelId: string;
  label: string;
  providerKey: string;
  accent: string;
  size?: number;
}) {
  const artwork = modelArtworkUrl(modelId, label);
  if (artwork) {
    return (
      <span
        className="agent-mark agent-mark--art"
        style={{ width: size, height: size, "--mark-accent": accent } as React.CSSProperties}
      >
        <img src={artwork} alt="" style={{ width: size, height: size }} />
      </span>
    );
  }
  return <ProviderMark provider={providerKey} label={label} accent={accent} size={size} />;
}

/** Mark for a model-catalog provider key (anthropic, deepseek, xai…). */
export function ProviderMark({
  provider,
  label,
  accent,
  size = 24,
}: {
  provider: string;
  label: string;
  accent: string;
  size?: number;
}) {
  const icon = iconForProvider(provider);
  const style = { width: size, height: size, "--mark-accent": accent } as React.CSSProperties;
  if (icon) {
    return (
      <span className="agent-mark" style={style}>
        <img src={icon} alt="" style={{ width: Math.round(size * 0.72), height: Math.round(size * 0.72) }} />
      </span>
    );
  }
  return (
    <span className="agent-mark agent-mark--letter" style={style}>
      {label.charAt(0).toUpperCase()}
    </span>
  );
}

function ShellGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 17l6-5-6-5" />
      <path d="M13 19h7" />
    </svg>
  );
}

function SshGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </svg>
  );
}

/** Provider brand mark, dedicated glyph, or tinted letter — in that order. */
export function AgentMark({
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
  const icon = providerIconFor(agentId);
  const style = {
    width: size,
    height: size,
    "--mark-accent": accent,
  } as React.CSSProperties;
  const glyphSize = Math.round(size * 0.58);

  if (icon) {
    return (
      <span className="agent-mark" style={style}>
        <img src={icon} alt="" style={{ width: Math.round(size * 0.72), height: Math.round(size * 0.72) }} />
      </span>
    );
  }
  if (agentId === "shell") {
    return (
      <span className="agent-mark agent-mark--glyph" style={style}>
        <ShellGlyph size={glyphSize} />
      </span>
    );
  }
  if (agentId === "ssh") {
    return (
      <span className="agent-mark agent-mark--glyph" style={style}>
        <SshGlyph size={glyphSize} />
      </span>
    );
  }
  return (
    <span className="agent-mark agent-mark--letter" style={style}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
