import { useState } from "react";

import { useAgentWorkStore } from "../../state/agentWorkStore";
import { EditorDialog } from "./EditorDialog";

/**
 * Writing a skill.
 *
 * Four fields, and the last two are the ones people skip. A skill without a
 * verification step is a habit, and a habit that half-works is
 * indistinguishable from one that works until someone checks; a skill without
 * a boundary is an instruction to keep going. The placeholders are examples
 * rather than hints because a blank textarea labelled "Procedure" produces
 * one-line skills.
 */
const FIELDS = [
  {
    key: "trigger",
    label: "When this applies",
    placeholder: "Just changed code in response to a bug or a failing test",
    rows: 2,
  },
  {
    key: "procedure",
    label: "What to do",
    placeholder: "1. Re-run the exact command that first showed the problem.\n2. Paste the real output.",
    rows: 6,
  },
  {
    key: "verification",
    label: "How to know it worked",
    placeholder: "The original reproduction now passes, and its output is in the reply.",
    rows: 2,
  },
  {
    key: "boundary",
    label: "Stop and ask before",
    placeholder: "Reporting success without having re-run the case.",
    rows: 2,
  },
] as const;

export function SkillEditor({ skillId, onClose }: { skillId?: string; onClose: () => void }) {
  const skills = useAgentWorkStore((state) => state.skills);
  const save = useAgentWorkStore((state) => state.saveSkill);
  const error = useAgentWorkStore((state) => state.error);
  const existing = skills.find((skill) => skill.id === skillId);

  const [draft, setDraft] = useState({
    name: existing?.name ?? "",
    summary: existing?.summary ?? "",
    trigger: existing?.trigger ?? "",
    procedure: existing?.procedure ?? "",
    verification: existing?.verification ?? "",
    boundary: existing?.boundary ?? "",
  });

  const submit = async () => {
    if (await save(draft, skillId)) onClose();
  };

  return (
    <EditorDialog
      title={skillId ? `Edit ${existing?.name ?? "skill"}` : "Write a skill"}
      lede={
        skillId
          ? "Saving makes a new version. Earlier ones stay readable, and any of them can be restored."
          : "Once installed, this is offered to the teammates you give it to in every turn, and expanded when its trigger matches."
      }
      submitLabel={skillId ? "Save as a new version" : "Install skill"}
      busy={!draft.name.trim() || !draft.trigger.trim() || !draft.procedure.trim()}
      error={error}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <label className="field">
        <span>Name</span>
        <input
          className="input"
          autoFocus
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          placeholder="Prove it before saying it works"
        />
      </label>
      <label className="field">
        <span>One line about it</span>
        <input
          className="input"
          value={draft.summary}
          onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
          placeholder="Re-run the original failing case rather than reasoning that a fix should hold"
        />
      </label>
      {FIELDS.map(({ key, label, placeholder, rows }) => (
        <label className="field" key={key}>
          <span>{label}</span>
          <textarea
            className="input"
            rows={rows}
            value={draft[key]}
            placeholder={placeholder}
            onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
          />
        </label>
      ))}
    </EditorDialog>
  );
}
