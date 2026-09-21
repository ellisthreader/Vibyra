import { useState } from "react";

import { useAgentStore } from "../../state/agentStore";
import type { AgentSpec, Settings } from "../../types";
import { CloseIcon, PlusIcon } from "../common/Icons";

interface Props {
  settings: Settings;
  update: (partial: Partial<Settings>) => Promise<void>;
  adding: boolean;
  onAdded: () => void;
}

/**
 * The list of agents the user pointed Vibyra at, and the form to add one,
 * shown only on request. Program, arguments and the generated id keep their
 * stored shape so existing custom agents load unchanged.
 */
export function CustomAgentsEditor({ settings, update, adding, onAdded }: Props) {
  const refreshAgents = useAgentStore((state) => state.refresh);
  const [draft, setDraft] = useState({ name: "", program: "", args: "" });

  const save = async (customAgents: AgentSpec[]) => {
    await update({ customAgents });
    await refreshAgents();
  };

  const addAgent = () => {
    const program = draft.program.trim();
    const name = draft.name.trim() || program.split("/").pop() || program;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!id || !program) return;
    const agent: AgentSpec = {
      id,
      name,
      program,
      args: draft.args.trim() ? draft.args.trim().split(/\s+/) : [],
      env: [],
      accent: "#5b7cfa",
      description: "User-defined agent",
      custom: true,
    };
    void save([...settings.customAgents.filter((item) => item.id !== id), agent]);
    setDraft({ name: "", program: "", args: "" });
    onAdded();
  };

  return (
    <>
      {settings.customAgents.map((agent) => (
        <div key={agent.id} className="agent-row">
          <div className="agent-row__meta">
            <span className="agent-row__name">{agent.name}</span>
            <code className="agent-row__cmd">{[agent.program, ...agent.args].join(" ")}</code>
          </div>
          <button className="icon-btn icon-btn--danger" title="Remove agent" aria-label={`Remove ${agent.name}`} onClick={() => void save(settings.customAgents.filter((item) => item.id !== agent.id))}>
            <CloseIcon size={13} />
          </button>
        </div>
      ))}
      {adding && (
        <div className="agent-form agent-form--inset">
          <label className="agent-form__field">
            <span>Program</span>
            <input className="input" placeholder="goose" value={draft.program} onChange={(event) => setDraft({ ...draft, program: event.target.value })} spellCheck={false} />
            <small>Must be on your PATH, or a full path.</small>
          </label>
          <label className="agent-form__field">
            <span>Name</span>
            <input className="input" placeholder="Goose" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} spellCheck={false} />
          </label>
          <label className="agent-form__field">
            <span>Arguments</span>
            <input className="input" placeholder="optional" value={draft.args} onChange={(event) => setDraft({ ...draft, args: event.target.value })} spellCheck={false} />
          </label>
          <div className="agent-form__foot">
            <button className="btn btn--primary" onClick={addAgent} disabled={!draft.program.trim()}>
              <PlusIcon size={13} /> Add agent
            </button>
          </div>
        </div>
      )}
    </>
  );
}
