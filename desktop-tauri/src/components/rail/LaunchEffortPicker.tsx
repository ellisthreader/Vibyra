import type { CSSProperties } from "react";

import type { EffortOption } from "../../lib/modelEffort";
import type { LaunchEffort } from "../../state/launchSettingsStore";

interface LaunchEffortPickerProps {
  options: EffortOption[];
  value: LaunchEffort;
  onChange: (value: LaunchEffort) => void;
}

export function LaunchEffortPicker({ options, value, onChange }: LaunchEffortPickerProps) {
  const selected = options.find((option) => option.value === value) ?? options[0];
  if (!selected) return null;
  const selectedIndex = options.indexOf(selected);
  const fill = options.length > 1 ? (selectedIndex / (options.length - 1)) * 100 : 0;
  const style = { "--effort-fill": `${fill}%` } as CSSProperties;

  return (
    <fieldset className="launch-field launch-effort">
      <legend>
        <span>Effort</span>
        <span className="launch-effort__value">
          <strong>{selected.label}</strong>
          <small>{selected.hint}</small>
        </span>
      </legend>
      <div className="launch-effort__control" style={style}>
        <input
          type="range"
          min={0}
          max={options.length - 1}
          step={1}
          value={selectedIndex}
          aria-label="Reasoning effort"
          aria-valuetext={selected.label}
          onChange={(event) => onChange(options[Number(event.currentTarget.value)].value)}
        />
        <span className="launch-effort__ticks" aria-hidden="true">
          {options.map((option, index) => (
            <i key={option.value} className={index <= selectedIndex ? "is-active" : ""} />
          ))}
        </span>
      </div>
      <div className="launch-effort__ends" aria-hidden="true">
        <span>{options[0].label}</span>
        <span>{options[options.length - 1].label}</span>
      </div>
    </fieldset>
  );
}
