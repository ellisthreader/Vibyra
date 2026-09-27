import type { AgentInstall } from "../../ipc/agentInstall";
import { accentFor } from "../../lib/providerAccents";
import type { ResolvedAgent } from "../../types";
import { AgentBrandMark } from "../common/AgentBrandMark";
import { CopyButton } from "../common/CopyButton";
import { Switch } from "./SettingsShared";

/** What each agent is for, in the user's terms rather than the catalog's. */
const SUBTITLE: Record<string, string> = {
  qwen: "Alibaba · Qwen models",
  aider: "Open source · OpenRouter models",
  opencode: "Open source · OpenRouter models",
  copilot: "GitHub",
  amp: "Sourcegraph",
  crush: "Charm",
  continue: "Continue Dev",
};

/**
 * One agent in the More dialog: mark, name, one line about it, one control.
 *
 * Exactly one control per row is the point. Which one depends on where the
 * agent is: not here yet and installable by Vibyra, not here and not ours to
 * install, on its way, or here and simply on or off.
 */
export function MoreAgentsRow({
  agent,
  enabled,
  install,
  onInstall,
  onDismiss,
  onToggle,
}: {
  agent: ResolvedAgent;
  enabled: boolean;
  install: AgentInstall | undefined;
  onInstall: () => void;
  onDismiss: () => void;
  onToggle: () => void;
}) {
  const accent = accentFor(agent.id, agent.accent);
  const manual = agent.install?.manager === "manual";
  const running = install?.running ?? false;
  const error = install?.error ?? null;

  const line = error
    ? error
    : running
      ? `Installing ${agent.install?.package ?? agent.program}…`
      : agent.installed
        ? SUBTITLE[agent.id] ?? agent.description
        : manual
          ? agent.install?.command ?? `Needs the ${agent.program} command`
          : SUBTITLE[agent.id] ?? agent.description;

  return (
    <div className={`agent-row${error ? " agent-row--error" : ""}`}>
      <AgentBrandMark agentId={agent.id} name={agent.name} accent={accent} size={30} />
      <span className="agent-row__text">
        <span className="agent-row__name">{agent.name}</span>
        <span className={`agent-row__line${manual && !agent.installed && !error ? " agent-row__line--code" : ""}`}>
          {line}
        </span>
      </span>
      {error ? (
        <button className="btn btn--compact" onClick={onDismiss}>
          Try again
        </button>
      ) : running ? (
        <button className="btn btn--compact" disabled>
          Installing…
        </button>
      ) : agent.installed ? (
        <Switch checked={enabled} label={`Use ${agent.name}`} onChange={onToggle} />
      ) : manual ? (
        <CopyButton value={agent.install?.command ?? ""} label="Copy" className="btn btn--compact" />
      ) : (
        <button className="btn btn--compact" onClick={onInstall}>
          Install
        </button>
      )}
    </div>
  );
}
