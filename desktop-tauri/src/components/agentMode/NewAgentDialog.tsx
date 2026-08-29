import { useRef, useState } from "react";

import type { Engine } from "../../agentTypes";
import { useModalFocus } from "../../lib/useModalFocus";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore, capabilityFor } from "../../state/agentRosterStore";

/**
 * Creating a teammate: three fields, then it opens.
 *
 * Everything else — model, effort, places, memory budget, skills, messaging —
 * has a strong default and is changed later in the agent's own settings. A
 * wizard would ask nine questions at the one moment the user has the least
 * information, and most of the answers would be the defaults anyway.
 */
export function NewAgentDialog({ onClose }: { onClose: () => void }) {
  const create = useAgentRosterStore((state) => state.create);
  const capabilities = useAgentRosterStore((state) => state.capabilities);
  const error = useAgentRosterStore((state) => state.error);
  const selectAgent = useAgentModeStore((state) => state.selectAgent);
  const usable = capabilities.filter((entry) => entry.structured);

  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [engine, setEngine] = useState<Engine>(usable[0]?.engine ?? "claude");
  const [busy, setBusy] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  useModalFocus(shell, true, onClose);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const profile = await create(name.trim(), brief.trim(), engine);
    setBusy(false);
    if (profile) {
      selectAgent(profile.id);
      onClose();
    }
  };

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div
        className="modal modal--narrow"
        ref={shell}
        role="dialog"
        aria-label="New agent"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>New agent</h2>
        <p className="modal__lede">
          A teammate keeps its own brief, memory, skills and folders across every chat you have
          with it.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="settings-field">
            <span>Name</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Release"
            />
          </label>

          <label className="settings-field">
            <span>What it is for</span>
            <textarea
              rows={5}
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder={
                "What it is responsible for, the context it needs, the standard you expect, " +
                "and where it should stop and ask you."
              }
            />
          </label>

          <label className="settings-field">
            <span>Engine</span>
            <select value={engine} onChange={(event) => setEngine(event.target.value as Engine)}>
              {(usable.length > 0 ? usable : capabilities).map((entry) => (
                <option key={entry.engine} value={entry.engine} disabled={!entry.structured}>
                  {entry.engine === "claude" ? "Claude Code" : "Codex"}
                  {entry.structured ? "" : " — unavailable"}
                </option>
              ))}
            </select>
          </label>
          {(() => {
            const chosen = capabilityFor(capabilities, engine);
            return chosen.structured ? null : (
              <p className="panel__error">{chosen.blocker}</p>
            );
          })()}
          {error && <p className="panel__error">{error}</p>}

          <div className="modal__actions">
            <button type="submit" className="btn-primary" disabled={!name.trim() || busy}>
              Create
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
