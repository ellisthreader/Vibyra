import { useEffect, useState } from "react";

import { MinusIcon, PlusIcon } from "../common/Icons";

const MAX_TERMINALS = 12;
const COUNTS = Array.from({ length: MAX_TERMINALS }, (_, index) => index + 1);

interface LaunchTerminalCountProps {
  value: number;
  onChange: (value: number) => void;
}

/**
 * How many terminals the launch opens. A stepper covers the usual case (one
 * more, one fewer); the number itself opens the exact 1–12 grid for jumps.
 */
export function LaunchTerminalCount({ value, onChange }: LaunchTerminalCountProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="launch-row launch-count" role="group" aria-label="Terminals">
      <span className="launch-row__label">
        <strong>Terminals</strong>
        <small>{value === 1 ? "One pane" : `${value} panes side by side`}</small>
      </span>
      <div className="launch-stepper">
        <button type="button" aria-label="One fewer terminal" disabled={value <= 1} onClick={() => onChange(value - 1)}>
          <MinusIcon size={14} />
        </button>
        <button
          type="button"
          className="launch-stepper__value"
          aria-label={`${value} ${value === 1 ? "terminal" : "terminals"}, choose a number`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls="launch-terminal-count-menu"
          onClick={() => setOpen(!open)}
        >
          {value}
        </button>
        <button type="button" aria-label="One more terminal" disabled={value >= MAX_TERMINALS} onClick={() => onChange(value + 1)}>
          <PlusIcon size={14} />
        </button>
      </div>
      {open && (
        <>
          <div className="launch-model__backdrop" onClick={() => setOpen(false)} />
          <div
            id="launch-terminal-count-menu"
            className="launch-menu launch-menu--right launch-count__menu"
            role="listbox"
            aria-label="Number of terminals"
          >
            {COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                role="option"
                aria-selected={count === value}
                className={count === value ? "is-active" : ""}
                onClick={() => {
                  onChange(count);
                  setOpen(false);
                }}
              >
                {count}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
