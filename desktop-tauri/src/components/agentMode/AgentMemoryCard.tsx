import { useEffect, useState } from "react";

import type { AgentProfile, Reflection } from "../../agentTypes";
import { NONE } from "../../lib/emptyList";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import { AgentMemoryRow } from "./AgentMemoryRow";

/**
 * What this agent knows between conversations.
 *
 * Proposals lead, because those are the only rows that need a person. The
 * budget below is deliberately worded as a prompt limit rather than a size
 * limit: everything that does not fit stays stored, searchable and
 * correctable, and saying otherwise would make people delete things to make
 * room.
 */
export function AgentMemoryCard({ agent }: { agent: AgentProfile }) {
  const entries = useAgentWorkStore((state) => state.memory[agent.id] ?? NONE);
  const load = useAgentWorkStore((state) => state.loadMemory);
  const add = useAgentWorkStore((state) => state.addMemory);
  const setStatus = useAgentWorkStore((state) => state.setMemoryStatus);
  const amend = useAgentWorkStore((state) => state.amendMemory);
  const remove = useAgentWorkStore((state) => state.deleteMemory);
  const error = useAgentWorkStore((state) => state.error);
  const update = useAgentRosterStore((state) => state.update);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void load(agent.id);
  }, [agent.id, load]);

  const proposed = entries.filter((entry) => entry.status === "proposed");
  const active = entries.filter((entry) => entry.status === "active");

  const submit = () => {
    if (!draft.trim()) return;
    void add(agent.id, draft.trim(), "fact");
    setDraft("");
  };

  return (
    <section className="settings-block">
      <span className="section-label">Memory</span>
      <div className="settings-group">
        <label className="setting-row">
          <span className="setting-row__text">
            <span className="setting-row__label">Learning from its own work</span>
            <span className="setting-row__hint">
              Whether it may extract facts and rules from a finished turn, and who commits them.
            </span>
          </span>
          <span className="setting-row__control">
            <select
              className="input"
              value={agent.reflection}
              onChange={(event) =>
                void update(agent.id, { reflection: event.target.value as Reflection })
              }
            >
              <option value="off">Off — never extracts anything</option>
              <option value="suggest">Suggest — everything waits for you</option>
              <option value="automatic">Automatic — facts commit, rules ask</option>
            </select>
          </span>
        </label>

        <label className="setting-row">
          <span className="setting-row__text">
            <span className="setting-row__label">How much reaches a prompt</span>
            <span className="setting-row__hint">
              A prompt budget, not a size limit. What does not fit is still stored and still
              searchable. Pinned entries are always included.
            </span>
          </span>
          <span className="setting-row__control">
            <select
              className="input"
              value={agent.memoryBudget}
              onChange={(event) =>
                void update(agent.id, { memoryBudget: Number(event.target.value) })
              }
            >
              {[1000, 2000, 4000, 8000, 16000].map((size) => (
                <option key={size} value={size}>
                  {size.toLocaleString()} characters
                </option>
              ))}
            </select>
          </span>
        </label>
        {error && <p className="settings-note settings-note--error">{error}</p>}
      </div>

      {proposed.length > 0 && (
        <>
          <div className="panel__section-head">
            <span className="section-label">Waiting for you</span>
            <span className="panel__count panel__count--ask">{proposed.length}</span>
          </div>
          <div className="settings-group">
            {proposed.map((entry) => (
              <AgentMemoryRow
                key={entry.id}
                entry={entry}
                onKeep={() => void setStatus(agent.id, entry.id, "active")}
                onReject={() => void setStatus(agent.id, entry.id, "rejected")}
              />
            ))}
          </div>
        </>
      )}

      <div className="panel__section-head">
        <span className="section-label">What it knows</span>
        {active.length > 0 && <span className="panel__count">{active.length}</span>}
      </div>
      <div className="settings-group">
        {active.length === 0 && (
          <p className="settings-note">
            Nothing yet. Add something below, or let it learn from its own work.
          </p>
        )}
        {active.map((entry) => (
          <AgentMemoryRow
            key={entry.id}
            entry={entry}
            onPin={() => void amend(agent.id, entry.id, { pinned: !entry.pinned })}
            onDelete={() => void remove(agent.id, entry.id)}
          />
        ))}
        <div className="settings-group__foot memory-add">
          <input
            className="input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder="Something this teammate should always know"
          />
          <button className="btn btn--sm" disabled={!draft.trim()} onClick={submit}>
            Add
          </button>
        </div>
      </div>
    </section>
  );
}
