import { useState } from "react";

import { useAgentStore } from "../../state/agentStore";
import type { AgentSpec } from "../../types";
import { CloseIcon, PlusIcon } from "../common/Icons";
import { SettingsBlock, type SettingsPaneProps } from "./SettingsShared";

export function SettingsAgentsPane({ settings, update }: SettingsPaneProps) {
  const refreshAgents = useAgentStore((state) => state.refresh);
  const [draft, setDraft] = useState({ id: "", name: "", program: "", args: "" });
  const save = async (customAgents: AgentSpec[]) => {
    await update({ customAgents });
    await refreshAgents();
  };
  const addAgent = () => {
    const id = draft.id.trim().toLowerCase().replace(/\s+/g, "-");
    if (!id || !draft.program.trim()) return;
    const agent: AgentSpec = {
      id,
      name: draft.name.trim() || draft.id.trim(),
      program: draft.program.trim(),
      args: draft.args.trim() ? draft.args.trim().split(/\s+/) : [],
      env: [],
      accent: "#5b7cfa",
      description: "User-defined agent",
      custom: true,
    };
    void save([...settings.customAgents.filter((item) => item.id !== id), agent]);
    setDraft({ id: "", name: "", program: "", args: "" });
  };

  return (
    <>
      <p className="settings-lead">Point at any AI CLI on your machine — it appears in the rail instantly.</p>
      <SettingsBlock label="Installed">
        {settings.customAgents.length === 0 ? <div className="settings-empty">No custom agents yet</div> : (
          <div className="settings-group">{settings.customAgents.map((agent) => (
            <div key={agent.id} className="agent-row">
              <div className="agent-row__meta">
                <span className="agent-row__name">{agent.name}</span>
                <code className="agent-row__cmd">{[agent.program, ...agent.args].join(" ")}</code>
              </div>
              <button className="icon-btn icon-btn--danger" title="Remove agent" onClick={() => void save(settings.customAgents.filter((item) => item.id !== agent.id))}><CloseIcon size={13} /></button>
            </div>
          ))}</div>
        )}
      </SettingsBlock>
      <SettingsBlock label="Add agent">
        <div className="settings-group agent-form">
          <label className="agent-form__field"><span>ID</span><input className="input" placeholder="goose" value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value })} spellCheck={false} /></label>
          <label className="agent-form__field"><span>Display name</span><input className="input" placeholder="Goose" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} spellCheck={false} /></label>
          <label className="agent-form__field"><span>Program</span><input className="input" placeholder="goose (must be in PATH)" value={draft.program} onChange={(event) => setDraft({ ...draft, program: event.target.value })} spellCheck={false} /></label>
          <label className="agent-form__field"><span>Arguments</span><input className="input" placeholder="optional" value={draft.args} onChange={(event) => setDraft({ ...draft, args: event.target.value })} spellCheck={false} /></label>
          <div className="agent-form__foot"><button className="btn btn--primary" onClick={addAgent} disabled={!draft.id.trim() || !draft.program.trim()}><PlusIcon size={13} /> Add agent</button></div>
        </div>
      </SettingsBlock>
    </>
  );
}
