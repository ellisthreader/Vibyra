import { useEffect, useState } from "react";

import { ChevronDownIcon } from "../common/Icons";

const MAX_TERMINALS = 12;
const COUNTS = Array.from({ length: MAX_TERMINALS }, (_, index) => index + 1);

interface LaunchTerminalCountProps {
  value: number;
  onChange: (value: number) => void;
}

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
    <fieldset className="launch-field launch-count">
      <legend>Terminals</legend>
      <button
        type="button"
        className="launch-count__current"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="launch-terminal-count-menu"
        onClick={() => setOpen(!open)}
      >
        <span className="launch-count__preview" aria-hidden="true">
          {COUNTS.map((count) => (
            <i key={count} className={count <= value ? "is-active" : ""} />
          ))}
        </span>
        <span className="launch-count__copy">
          <strong>{value}</strong>
          <small>{value === 1 ? "terminal" : "terminals"}</small>
        </span>
        <ChevronDownIcon size={11} />
      </button>
      {open && (
        <>
          <div className="launch-model__backdrop" onClick={() => setOpen(false)} />
          <div
            id="launch-terminal-count-menu"
            className="launch-count__menu"
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
    </fieldset>
  );
}
