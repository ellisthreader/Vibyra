import type { PermissionMode } from "../../agentTypes";

/**
 * Plan / Standard / Full, for this turn.
 *
 * The copy is the point. "Full access" sounds like a convenience setting and
 * is not one, so the label says what it actually changes and the description
 * says what it still does not authorise — publishing, spending and secrets
 * pass through the approval broker at every level.
 */
const LEVELS: { id: PermissionMode; label: string; hint: string }[] = [
  { id: "plan", label: "Plan", hint: "Read and think. No edits, no commands with effects." },
  {
    id: "standard",
    label: "Standard",
    hint: "Edit inside the folders you granted. Anything outward still asks.",
  },
  {
    id: "full",
    label: "Full access",
    hint:
      "Edit inside your granted folders with the provider's sandbox relaxed. " +
      "Still never publishes, spends or reveals a secret without asking.",
  },
];

export function PermissionPicker({
  value,
  onChange,
}: {
  value: PermissionMode;
  onChange: (level: PermissionMode) => void;
}) {
  const current = LEVELS.find((level) => level.id === value) ?? LEVELS[0];

  return (
    <label className="permission-picker" title={current.hint}>
      <span className="section-label">Access</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as PermissionMode)}
        aria-label="What this turn may do"
      >
        {LEVELS.map((level) => (
          <option key={level.id} value={level.id}>
            {level.label}
          </option>
        ))}
      </select>
    </label>
  );
}
