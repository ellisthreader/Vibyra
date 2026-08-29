import { useState } from "react";

import type { AgentProfile, PermissionMode } from "../../agentTypes";
import { useAgentRosterStore, capabilityFor } from "../../state/agentRosterStore";

/**
 * Who this agent is and what it may do by default.
 *
 * The brief is the field that matters most and gets the most room. It is
 * injected ahead of every turn in every chat this agent owns, which is what
 * makes a teammate a teammate rather than a saved prompt — and the placeholder
 * says what a good one contains, because "You are a helpful assistant" is what
 * people write otherwise.
 */
export function AgentBriefCard({ agent }: { agent: AgentProfile }) {
  const update = useAgentRosterStore((state) => state.update);
  const capability = useAgentRosterStore((state) =>
    capabilityFor(state.capabilities, agent.engine),
  );
  const [name, setName] = useState(agent.name);
  const [brief, setBrief] = useState(agent.brief);

  return (
    <section className="settings-card">
      <h3>Identity</h3>
      <label className="settings-field">
        <span>Name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => name.trim() && name !== agent.name && void update(agent.id, { name })}
        />
      </label>
      <label className="settings-field">
        <span>Brief</span>
        <textarea
          rows={6}
          value={brief}
          placeholder={
            "What this teammate is responsible for, the context it needs, the quality bar, " +
            "and where it should stop and ask you."
          }
          onChange={(event) => setBrief(event.target.value)}
          onBlur={() => brief !== agent.brief && void update(agent.id, { brief })}
        />
      </label>

      <label className="settings-row">
        <span className="settings-row__label">Default access</span>
        <select
          value={agent.permission}
          onChange={(event) =>
            void update(agent.id, { permission: event.target.value as PermissionMode })
          }
        >
          <option value="plan">Plan only</option>
          <option value="standard">Standard</option>
          <option value="full">Full access</option>
        </select>
      </label>

      {capability.supportsModel && (
        <label className="settings-row">
          <span className="settings-row__label">Model</span>
          <input
            defaultValue={agent.model ?? ""}
            placeholder="The CLI's own default"
            onBlur={(event) =>
              void update(agent.id, { model: event.target.value.trim() || null })
            }
          />
        </label>
      )}

      {capability.supportsEffort && (
        <label className="settings-row">
          <span className="settings-row__label">Effort</span>
          <select
            value={agent.effort ?? ""}
            onChange={(event) => void update(agent.id, { effort: event.target.value || null })}
          >
            <option value="">Default</option>
            {["low", "medium", "high"].map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
