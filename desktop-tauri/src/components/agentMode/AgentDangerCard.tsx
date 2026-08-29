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
    <section className="settings-card settings-card--danger">
      <h3>Archive or delete</h3>
      <div className="settings-row">
        <span className="settings-row__label">
          Hide this teammate without losing anything
        </span>
        <button className="btn-ghost" onClick={() => void archive(agent.id, true)}>
          Archive
        </button>
      </div>

      {!open ? (
        <div className="settings-row">
          <span className="settings-row__label">
            Delete {agent.name}, its chats, memory, routines and its own folder
          </span>
          <button className="btn-ghost btn-ghost--danger" onClick={() => setOpen(true)}>
            Delete…
          </button>
        </div>
      ) : (
        <div className="danger-confirm">
          <p>
            This removes every chat, every memory and everything in {agent.name}&rsquo;s own
            folder. Decisions it asked for stay in the record. Type its name to confirm.
          </p>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={agent.name}
            aria-label={`Type ${agent.name} to confirm deletion`}
          />
          <div className="danger-confirm__actions">
            <button
              className="btn-ghost btn-ghost--danger"
              disabled={typed.trim() !== agent.name}
              onClick={async () => {
                await remove(agent.id);
                selectAgent(null);
              }}
            >
              Delete {agent.name}
            </button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
