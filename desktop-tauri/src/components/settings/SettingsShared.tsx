import { useId, type ReactNode } from "react";

import type { Settings } from "../../types";

export interface SettingsPaneProps {
  settings: Settings;
  update: (partial: Partial<Settings>) => Promise<void>;
}

/** One label + control line. `hint` is for a consequence the label does not
 * carry on its own, never a restatement of the label. */
export function SettingRow({
  label,
  hint,
  stack,
  danger,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  stack?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const cls = ["setting-row", stack ? "setting-row--stack" : "", danger ? "setting-row--danger" : ""].join(" ").trim();
  return (
    <div role="group" aria-labelledby={`${id}-label`} className={cls}>
      <div className="setting-row__text">
        <span id={`${id}-label`} className="setting-row__label">{label}</span>
        {hint ? <span className="setting-row__hint">{hint}</span> : null}
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

/** A titled group. `panel` names it for deep links: the modal scrolls to and
 * briefly outlines the block whose `panel` matches the requested target. */
export function SettingsBlock({
  label,
  note,
  panel,
  children,
}: {
  label: string;
  note?: ReactNode;
  panel?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-block" data-panel={panel}>
      <span className="section-label">{label}</span>
      {note ? <span className="settings-block__note">{note}</span> : null}
      {children}
    </div>
  );
}

/** The house on/off control. A button rather than a checkbox: `role="switch"`
 * announces state directly, and the pill is drawn from `aria-checked` so there
 * is no hidden input to keep in step. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="vswitch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}
