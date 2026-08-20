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
