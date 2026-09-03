import { useState } from "react";

import type { Engine } from "../../agentTypes";
import { engineLabel } from "../../lib/agentEngineLabel";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore, capabilityFor } from "../../state/agentRosterStore";
import { EditorDialog } from "./EditorDialog";

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
  const chosen = capabilityFor(capabilities, engine);

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
    <EditorDialog
      title="New teammate"
      lede="A teammate keeps its own brief, memory, skills and folders across every chat you have with it."
      submitLabel="Create teammate"
      busy={busy || !name.trim() || !chosen.structured}
      error={error ?? (chosen.structured ? null : chosen.blocker)}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <label className="field">
        <span>Name</span>
        <input
          className="input"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Release"
        />
      </label>

      <label className="field">
        <span>What it is for</span>
        <textarea
          className="input"
          rows={5}
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder={
            "What it is responsible for, the context it needs, the standard you expect, " +
            "and where it should stop and ask you."
          }
        />
      </label>

      <label className="field">
        <span>Engine</span>
        <select
          className="input"
          value={engine}
          onChange={(event) => setEngine(event.target.value as Engine)}
        >
          {(usable.length > 0 ? usable : capabilities).map((entry) => (
            <option key={entry.engine} value={entry.engine} disabled={!entry.structured}>
              {engineLabel(entry.engine)}
              {entry.structured ? "" : " — unavailable"}
            </option>
          ))}
        </select>
      </label>
    </EditorDialog>
  );
}
