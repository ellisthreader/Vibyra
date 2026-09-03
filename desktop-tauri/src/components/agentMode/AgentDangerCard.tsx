import { useState } from "react";

import type { AgentProfile } from "../../agentTypes";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore } from "../../state/agentRosterStore";

/**
 * Archiving and deleting.
 *
 * Archive is offered first and is the reversible one. Deletion needs the name
 * typed because it takes the chats, the memory, the routines and the agent's
 * own folder with it — everything except the approval ledger, which has to
 * stay readable after the fact.
 */
export function AgentDangerCard({ agent }: { agent: AgentProfile }) {
  const archive = useAgentRosterStore((state) => state.archive);
  const remove = useAgentRosterStore((state) => state.remove);
  const selectAgent = useAgentModeStore((state) => state.selectAgent);
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <section className="settings-block">
      <span className="section-label">Archive or delete</span>
      <div className="settings-group settings-group--danger">
        <div className="setting-row">
          <span className="setting-row__text">
            <span className="setting-row__label">Archive {agent.name}</span>
            <span className="setting-row__hint">
              Hides it from the rail without losing anything. Its routines stop.
            </span>
          </span>
          <span className="setting-row__control">
            <button className="btn btn--sm" onClick={() => void archive(agent.id, true)}>
              Archive
            </button>
          </span>
        </div>

        {!open ? (
          <div className="setting-row">
            <span className="setting-row__text">
              <span className="setting-row__label">Delete {agent.name}</span>
              <span className="setting-row__hint">
                Removes its chats, memory, routines and its own folder. Decisions it asked for
                stay in the record.
              </span>
            </span>
            <span className="setting-row__control">
              <button className="btn btn--sm btn--danger" onClick={() => setOpen(true)}>
                Delete…
              </button>
            </span>
          </div>
        ) : (
          <div className="setting-row setting-row--stack danger-confirm">
            <span className="setting-row__text">
              <span className="setting-row__label">Type its name to confirm</span>
              <span className="setting-row__hint">
                This removes every chat, every memory and everything in {agent.name}&rsquo;s own
                folder. There is no undo.
              </span>
            </span>
            <span className="setting-row__control">
              <input
                className="input"
                autoFocus
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={agent.name}
                aria-label={`Type ${agent.name} to confirm deletion`}
              />
            </span>
            <span className="settings-row-actions danger-confirm__actions">
              <button className="btn btn--sm btn--secondary" onClick={() => setOpen(false)}>
                Keep it
              </button>
              <button
                className="btn btn--sm btn--danger"
                disabled={typed.trim() !== agent.name}
                onClick={async () => {
                  await remove(agent.id);
                  selectAgent(null);
                }}
              >
                Delete {agent.name}
              </button>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
