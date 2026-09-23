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
  sub,
  dim,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  stack?: boolean;
  danger?: boolean;
  /** Indents the row under the one above it, for a choice that only exists
   * because that row is on. A qualifier presented as a peer reads as a second
   * unrelated decision. */
  sub?: boolean;
  /** Fades label, hint and control together. A row whose control is greyed out
   * while its text stays bright reads as half-rendered rather than as off. */
  dim?: boolean;
  /** Optional: a row can be a statement with nothing to act on. */
  children?: ReactNode;
}) {
  const id = useId();
  const cls = ["setting-row", stack ? "setting-row--stack" : "", danger ? "setting-row--danger" : "", sub ? "setting-row--sub" : "", dim ? "settings-dim" : ""].join(" ").trim();
  return (
    <div role="group" aria-labelledby={`${id}-label`} className={cls}>
      <div className="setting-row__text">
        <span id={`${id}-label`} className="setting-row__label">{label}</span>
        {hint ? <span className="setting-row__hint">{hint}</span> : null}
      </div>
      {children ? <div className="setting-row__control">{children}</div> : null}
    </div>
  );
}

/** A titled group. `panel` names it for deep links: the modal scrolls to and
 * briefly outlines the block whose `panel` matches the requested target.
 * `label` is optional: a page's opening group is already named by the pane
 * header, and repeating it there is noise. */
export function SettingsBlock({
  label,
  note,
  panel,
  dim,
  children,
}: {
  label?: string;
  note?: ReactNode;
  panel?: string;
  /** See `SettingRow`'s `dim`: the whole block fades as one. */
  dim?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`settings-block${dim ? " settings-dim" : ""}`} data-panel={panel}>
      {label ? <span className="section-label">{label}</span> : null}
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
