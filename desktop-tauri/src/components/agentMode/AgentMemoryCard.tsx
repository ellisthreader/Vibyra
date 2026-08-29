import { useEffect, useState } from "react";

import type { AgentProfile, MemoryEntry, Reflection } from "../../agentTypes";
import { PinIcon, TrashIcon } from "../common/AgentIcons";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";

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
  const entries = useAgentWorkStore((state) => state.memory[agent.id] ?? []);
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

  return (
    <section className="settings-card">
      <h3>Memory</h3>

      <label className="settings-row">
        <span className="settings-row__label">Learning from its own work</span>
        <select
          value={agent.reflection}
          onChange={(event) =>
            void update(agent.id, { reflection: event.target.value as Reflection })
          }
        >
          <option value="off">Off — never extracts anything</option>
          <option value="suggest">Suggest — everything waits for you</option>
          <option value="automatic">Automatic — plain facts commit, rules still ask</option>
        </select>
      </label>

      <label className="settings-row">
        <span className="settings-row__label">How much reaches a prompt</span>
        <select
          value={agent.memoryBudget}
          onChange={(event) => void update(agent.id, { memoryBudget: Number(event.target.value) })}
        >
          {[1000, 2000, 4000, 8000, 16000].map((size) => (
            <option key={size} value={size}>
              {size.toLocaleString()} characters
            </option>
          ))}
        </select>
      </label>
      <p className="settings-card__hint">
        A prompt budget, not a size limit. What does not fit is still stored and still
        searchable — it simply is not injected that turn. Pinned entries always are.
      </p>

      {error && <p className="panel__error">{error}</p>}

      {proposed.length > 0 && (
        <>
          <p className="section-label">Waiting for you</p>
          <ul className="memory-list">
            {proposed.map((entry) => (
              <li key={entry.id} className="memory-row memory-row--proposed">
                <span className={`memory-row__class memory-row__class--${entry.class}`}>
                  {entry.class}
                </span>
                <p>{entry.body}</p>
                <div className="memory-row__actions">
                  <button className="btn-ghost" onClick={() => void setStatus(agent.id, entry.id, "active")}>
                    Keep
                  </button>
                  <button className="btn-ghost" onClick={() => void setStatus(agent.id, entry.id, "rejected")}>
                    No
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="section-label">What it knows</p>
      {active.length === 0 ? (
        <p className="settings-card__hint">Nothing yet.</p>
      ) : (
        <ul className="memory-list">
          {active.map((entry) => (
            <MemoryRow
              key={entry.id}
              entry={entry}
              onPin={() => void amend(agent.id, entry.id, { pinned: !entry.pinned })}
              onDelete={() => void remove(agent.id, entry.id)}
            />
          ))}
        </ul>
      )}

      <form
        className="memory-add"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          void add(agent.id, draft.trim(), "fact");
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Something this teammate should always know"
        />
        <button className="btn-ghost" type="submit">
          Add
        </button>
      </form>
    </section>
  );
}

function MemoryRow({
  entry,
  onPin,
  onDelete,
}: {
  entry: MemoryEntry;
  onPin: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={`memory-row ${entry.pinned ? "is-pinned" : ""}`}>
      <span className={`memory-row__class memory-row__class--${entry.class}`}>{entry.class}</span>
      <p>{entry.body}</p>
      <div className="memory-row__actions">
        <button className="icon-btn" title={entry.pinned ? "Unpin" : "Always include"} onClick={onPin}>
          <PinIcon size={12} />
        </button>
        <button className="icon-btn" title="Forget this" onClick={onDelete}>
          <TrashIcon size={12} />
        </button>
      </div>
    </li>
  );
}
