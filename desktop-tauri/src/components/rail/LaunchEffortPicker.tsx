import { useId, type CSSProperties } from "react";
import type { EffortOption } from "../../lib/modelEffort";
import type { LaunchEffort } from "../../state/launchSettingsStore";
import "../../styles/launch-effort.css";

interface LaunchEffortPickerProps {
  options: EffortOption[];
  value: LaunchEffort;
  onChange: (value: LaunchEffort) => void;
}

/** A keyboard-accessible slider with one stop per supported native effort. */
export function LaunchEffortPicker({ options, value, onChange }: LaunchEffortPickerProps) {
  const id = useId();
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[index];
  if (!selected || options.length < 2) return null;

  return (
    <div className="launch-row launch-effort">
      <div className="launch-effort__heading">
        <label htmlFor={id}>Effort</label>
        <output htmlFor={id}>{selected.label}</output>
      </div>
      <div className="launch-effort__track">
      <div className="launch-effort__stops" aria-hidden="true">
        {options.map((option, stop) => <i key={option.value} className={stop <= index ? "is-filled" : undefined} title={option.label} />)}
      </div>
      <input id={id} type="range" min={0} max={options.length - 1} step={1}
        value={index} aria-valuetext={selected.label} aria-describedby={selected.hint ? `${id}-hint` : undefined}
        style={{ "--effort-fill": `${index / (options.length - 1) * 100}%` } as CSSProperties}
        onChange={(event) => onChange(options[Number(event.target.value)].value)} />
      </div>
      <div className="launch-effort__ends" aria-hidden="true">
        <span>{options[0].label}</span><span>{options.at(-1)?.label}</span>
      </div>
      <small id={`${id}-hint`}>{selected.hint}</small>
    </div>
  );
}
