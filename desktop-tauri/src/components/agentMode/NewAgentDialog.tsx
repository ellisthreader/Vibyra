import { useState } from "react";

import type { Engine } from "../../agentTypes";
import { engineLabel } from "../../lib/agentEngineLabel";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore, capabilityFor } from "../../state/agentRosterStore";
import { useEditorSave } from "./useEditorSave";
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
  const capabilityError = useAgentRosterStore((state) => state.capabilityError);
  const loading = useAgentRosterStore((state) => state.loading);
  const recheck = useAgentRosterStore((state) => state.recheck);
  const selectAgent = useAgentModeStore((state) => state.selectAgent);
  const usable = capabilities.filter((entry) => entry.structured);

  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [selected, setEngine] = useState<Engine | null>(null);
  const engine = selected ?? usable[0]?.engine ?? capabilities[0]?.engine ?? "claude";
  const save = useEditorSave();
  const chosen = capabilityFor(capabilities, engine);

  const submit = () => {
    if (!name.trim() || loading || !chosen.structured) return;
    void save.run(() => create(name.trim(), brief.trim(), engine), (profile) => {
      if (profile) { selectAgent(profile.id); onClose(); }
    });
  };

  return (
    <EditorDialog
      title="New teammate"
      lede="A teammate keeps its own brief, memory, skills and folders across every chat you have with it."
      submitLabel="Create teammate"
      busy={save.busy}
      disabled={loading || !name.trim() || !chosen.structured}
      error={save.error ?? capabilityError ?? (loading ? null : chosen.structured ? null : chosen.blocker)}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <label className="field">
        <span>Name (required)</span>
        <input
          className="input"
          data-autofocus
          required
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Release"
        />
      </label>

      <label className="field">
        <span>What it is for (optional)</span>
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
          aria-label="Engine"
          value={engine}
          disabled={loading || capabilities.length === 0}
          onChange={(event) => setEngine(event.target.value as Engine)}
        >
          {capabilities.map((entry) => (
            <option key={entry.engine} value={entry.engine} disabled={!entry.structured}>
              {engineLabel(entry.engine)}
              {entry.structured ? "" : " — unavailable"}
            </option>
          ))}
        </select>
      </label>
        {loading && <span role="status">Checking local providers…</span>}
        {!loading && (capabilityError || !chosen.structured || capabilities.length === 0) && (
          <button type="button" className="btn btn--sm" onClick={() => void recheck()}>Recheck providers</button>
        )}
    </EditorDialog>
  );
}
