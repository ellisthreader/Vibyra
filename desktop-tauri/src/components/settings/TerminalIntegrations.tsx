import { useEffect } from "react";

import { MODEL_RUNNER_IDS } from "../../lib/modelRunners";
import { isAccountRuntime } from "../../lib/providerAccountPolicy";
import { accentFor } from "../../lib/providerAccents";
import { useAgentStore } from "../../state/agentStore";
import type { Settings } from "../../types";
import { AgentMark } from "../common/AgentMark";
import { SettingsBlock } from "./SettingsShared";

interface Props {
  settings: Settings;
  update: (partial: Partial<Settings>) => Promise<void>;
}

const MODEL_SCOPE: Record<string, string> = {
  qwen: "Qwen and Alibaba models",
  aider: "Other OpenRouter models",
  opencode: "Other OpenRouter models",
};

export function TerminalIntegrations({ settings, update }: Props) {
  const agents = useAgentStore((state) => state.agents);
  const refresh = useAgentStore((state) => state.refresh);
  const selected = new Set(settings.enabledAgentIds);
  const integrations = MODEL_RUNNER_IDS
    .filter((id) => !isAccountRuntime(id))
    .map((id) => agents.find((agent) => agent.id === id))
    .filter((agent) => Boolean(agent));

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = (id: string) => {
    const enabledAgentIds = selected.has(id)
      ? settings.enabledAgentIds.filter((item) => item !== id)
      : [...settings.enabledAgentIds, id];
    void update({ enabledAgentIds });
  };

  if (!integrations.length) return null;

  return (
    <SettingsBlock label="Additional runtimes">
      <div className="settings-group integration-list">
        {integrations.map((agent) => {
          if (!agent) return null;
          const active = selected.has(agent.id);
          const accent = accentFor(agent.id, agent.accent);
          return (
            <button
              key={agent.id}
              type="button"
              className={`terminal-integration${active ? " terminal-integration--active" : ""}`}
              aria-pressed={active}
              disabled={!agent.installed}
              onClick={() => toggle(agent.id)}
            >
              <AgentMark agentId={agent.id} name={agent.name} accent={accent} size={34} />
              <span className="terminal-integration__copy">
                <strong>{agent.name}</strong>
                {/* Naming the command it looks for turns "Not installed" from
                    a dead end into something the user can act on. */}
                <small>
                  {agent.installed
                    ? MODEL_SCOPE[agent.id] ?? agent.description
                    : `Needs the “${agent.program}” command on your PATH`}
                </small>
              </span>
              <span className={`settings-status${active ? " settings-status--success" : ""}`}>
                <i aria-hidden="true" />
                {!agent.installed ? "Not installed" : active ? "Selected" : "Available"}
              </span>
              <span className="terminal-integration__switch" aria-hidden="true"><i /></span>
            </button>
          );
        })}
      </div>
      <p className="settings-lead settings-lead--foot">
        Optional local runtimes can support model families without a connected company account.
      </p>
    </SettingsBlock>
  );
}
