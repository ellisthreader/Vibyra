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
    <section className="settings-block">
      <span className="section-label">Identity</span>
      <div className="settings-group">
        <label className="setting-row">
          <span className="setting-row__text">
            <span className="setting-row__label">Name</span>
            <span className="setting-row__hint">How it appears in the rail and in every card it raises.</span>
          </span>
          <span className="setting-row__control">
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => name.trim() && name !== agent.name && void update(agent.id, { name })}
            />
          </span>
        </label>

        <label className="setting-row setting-row--stack">
          <span className="setting-row__text">
            <span className="setting-row__label">Brief</span>
            <span className="setting-row__hint">
              Injected ahead of every turn in every chat this teammate owns. Saved when you leave
              the field.
            </span>
          </span>
          <span className="setting-row__control">
            <textarea
              className="input"
              rows={6}
              value={brief}
              placeholder={
                "What this teammate is responsible for, the context it needs, the quality bar, " +
                "and where it should stop and ask you."
              }
              onChange={(event) => setBrief(event.target.value)}
              onBlur={() => brief !== agent.brief && void update(agent.id, { brief })}
            />
          </span>
        </label>

        <label className="setting-row">
          <span className="setting-row__text">
            <span className="setting-row__label">Default access</span>
            <span className="setting-row__hint">
              What a new turn may do unless you narrow it in the composer. Publishing, spending
              and secrets ask at every level.
            </span>
          </span>
          <span className="setting-row__control">
            <select
              className="input"
              value={agent.permission}
              onChange={(event) =>
                void update(agent.id, { permission: event.target.value as PermissionMode })
              }
            >
              <option value="plan">Plan only</option>
              <option value="standard">Standard</option>
              <option value="full">Full access</option>
            </select>
          </span>
        </label>

        {capability.supportsModel && (
          <label className="setting-row">
            <span className="setting-row__text">
              <span className="setting-row__label">Model</span>
              <span className="setting-row__hint">Leave empty for the CLI's own default.</span>
            </span>
            <span className="setting-row__control">
              <input
                className="input"
                defaultValue={agent.model ?? ""}
                placeholder="Default"
                onBlur={(event) =>
                  void update(agent.id, { model: event.target.value.trim() || null })
                }
              />
            </span>
          </label>
        )}

        {capability.supportsEffort && (
          <label className="setting-row">
            <span className="setting-row__text">
              <span className="setting-row__label">Effort</span>
              <span className="setting-row__hint">How long it thinks before answering.</span>
            </span>
            <span className="setting-row__control">
              <select
                className="input input--sm"
                value={agent.effort ?? ""}
                onChange={(event) => void update(agent.id, { effort: event.target.value || null })}
              >
                <option value="">Default</option>
                {["low", "medium", "high"].map((level) => (
                  <option key={level} value={level}>
                    {level[0].toUpperCase() + level.slice(1)}
                  </option>
                ))}
              </select>
            </span>
          </label>
        )}
      </div>
    </section>
  );
}
