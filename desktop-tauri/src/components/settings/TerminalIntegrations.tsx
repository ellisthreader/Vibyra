import { useEffect } from "react";

import { MODEL_RUNNER_IDS } from "../../lib/modelRunners";
import { isAccountRuntime } from "../../lib/providerAccountPolicy";
import { accentFor } from "../../lib/providerAccents";
import { useAgentStore } from "../../state/agentStore";
import type { Settings } from "../../types";
import { AgentMark } from "../common/AgentMark";
import { SettingRow, Switch } from "./SettingsShared";

interface Props {
  settings: Settings;
  update: (partial: Partial<Settings>) => Promise<void>;
  /** `installed`: CLIs on this Mac, as switches (the accounts page).
   * `missing`: supported CLIs that are not installed (Advanced). */
  mode: "installed" | "missing";
}

const MODEL_SCOPE: Record<string, string> = {
  qwen: "Qwen and Alibaba models",
  aider: "Other OpenRouter models",
  opencode: "Other OpenRouter models",
};

/**
 * Optional local runtimes that need no company account. Only an installed CLI
 * can be switched on for the launcher; a missing one is listed under Advanced
 * with the command it looks for, so "not installed" is something to act on.
 */
/** The optional runtimes in one state, so a page can decide whether the
 * group is worth drawing before it draws the frame around it. */
export function useOptionalRuntimes(mode: Props["mode"]) {
  const agents = useAgentStore((state) => state.agents);
  const refresh = useAgentStore((state) => state.refresh);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return MODEL_RUNNER_IDS
    .filter((id) => !isAccountRuntime(id))
    .map((id) => agents.find((agent) => agent.id === id))
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent))
    .filter((agent) => (mode === "installed" ? agent.installed : !agent.installed));
}

export function TerminalIntegrations({ settings, update, mode }: Props) {
  const integrations = useOptionalRuntimes(mode);
  const selected = new Set(settings.enabledAgentIds);

  const toggle = (id: string) => {
    const enabledAgentIds = selected.has(id)
      ? settings.enabledAgentIds.filter((item) => item !== id)
      : [...settings.enabledAgentIds, id];
    void update({ enabledAgentIds });
  };

  if (!integrations.length) return null;

  return (
    <>
      {integrations.map((agent) => {
        const active = selected.has(agent.id);
        const accent = accentFor(agent.id, agent.accent);
        return (
          <SettingRow
            key={agent.id}
            label={<><AgentMark agentId={agent.id} name={agent.name} accent={accent} size={22} />{agent.name}</>}
            hint={agent.installed ? MODEL_SCOPE[agent.id] ?? agent.description : `Needs the “${agent.program}” command on your PATH`}
          >
            {agent.installed ? (
              <Switch checked={active} label={`Show ${agent.name} in the launcher`} onChange={() => toggle(agent.id)} />
            ) : null}
          </SettingRow>
        );
      })}
    </>
  );
}
