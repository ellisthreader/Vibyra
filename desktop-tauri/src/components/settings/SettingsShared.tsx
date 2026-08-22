import type { ReactNode } from "react";

import type { Settings } from "../../types";

export interface SettingsPaneProps {
  settings: Settings;
  update: (partial: Partial<Settings>) => Promise<void>;
}

export function SettingRow({
  label,
  hint,
  stack,
  children,
}: {
  label: string;
  hint?: ReactNode;
  stack?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={stack ? "setting-row setting-row--stack" : "setting-row"}>
      <div className="setting-row__text">
        <span className="setting-row__label">{label}</span>
        {hint ? <span className="setting-row__hint">{hint}</span> : null}
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

export function SettingsBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="settings-block">
      <span className="section-label">{label}</span>
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
