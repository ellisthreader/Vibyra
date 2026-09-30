import { useEffect, useState, type ReactNode } from "react";

import { CheckIcon, ChevronIcon, MinusIcon, PlusIcon } from "../common/Icons";

/** A short row of mutually exclusive choices. Replaces both the three theme
 * cards and the odd Saved/Off buttons that used to stand in for switches. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          disabled={disabled}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A bounded number with minus/plus, the way a font size wants to be set. The
 * middle is still an input so a keyboard user can type a value. */
export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  label: string;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const commitDraft = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) return setDraft(String(value));
    const next = clamp(parsed);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
        <MinusIcon size={12} />
      </button>
      <input
        className="stepper__value"
        aria-label={label}
        inputMode="numeric"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
      />
      {suffix ? <span className="stepper__suffix">{suffix}</span> : null}
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
        <PlusIcon size={12} />
      </button>
    </div>
  );
}

/** A collapsed group. Expert or rarely-used controls live here so the default
 * page stays short; a deep link can pass `open` to reveal one on arrival. */
export function Disclosure({
  title,
  summary,
  open,
  onToggle,
  panel,
  children,
}: {
  title: ReactNode;
  summary?: ReactNode;
  open: boolean;
  onToggle: (open: boolean) => void;
  panel?: string;
  children: ReactNode;
}) {
  return (
    <section className={`disclosure ${open ? "disclosure--open" : ""}`} data-panel={panel}>
      <button type="button" className="disclosure__head" aria-expanded={open} onClick={() => onToggle(!open)}>
        <span className="disclosure__title">{title}</span>
        {summary ? <span className="disclosure__summary">{summary}</span> : null}
        <span className="disclosure__chev" aria-hidden="true"><ChevronIcon size={14} /></span>
      </button>
      {open ? <div className="disclosure__body">{children}</div> : null}
    </section>
  );
}

/** Scannable state: Connected, Not set up, Blocked, Restart required. Read
 * before any sentence, which is the point. */
export function StatusChip({ tone, children }: { tone: "on" | "off" | "warn" | "busy" | "accent"; children: ReactNode }) {
  return (
    <span className={`status-chip status-chip--${tone}`}>
      {tone === "on" ? <CheckIcon size={11} /> : <i aria-hidden="true" />}
      {children}
    </span>
  );
}

/** A text field that only reports a value when the user is done with it:
 * blur or Enter. Escape puts the saved value back. */
export function CommitInput({
  value,
  onCommit,
  label,
  placeholder,
  className,
  type,
}: {
  value: string;
  onCommit: (next: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  type?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={className ?? "input"}
      type={type ?? "text"}
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        if (event.key === "Escape") setDraft(value);
      }}
    />
  );
}
