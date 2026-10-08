import { useState } from "react";

import { isMac } from "../../lib/platform";
import { useSettingsStore } from "../../state/settingsStore";
import { CommitInput, Segmented } from "./SettingsControls";
import { SettingRow, type SettingsPaneProps } from "./SettingsShared";

const CUSTOM = "__custom";

/** Monospace faces commonly present on a Mac or Linux box. The saved value is
 * the full stack, so an unlisted family still round-trips as Custom. */
const FONTS: { id: string; label: string }[] = [
  { id: `"JetBrains Mono", "Fira Code", monospace`, label: "JetBrains Mono (default)" },
  { id: `"SF Mono", ui-monospace, Menlo, monospace`, label: "SF Mono" },
  { id: `Menlo, ui-monospace, monospace`, label: "Menlo" },
  { id: `"Fira Code", ui-monospace, monospace`, label: "Fira Code" },
  { id: `"Cascadia Code", ui-monospace, monospace`, label: "Cascadia Code" },
  { id: `"Source Code Pro", ui-monospace, monospace`, label: "Source Code Pro" },
];

const SCROLLBACK: { id: string; label: string }[] = [
  { id: "1000", label: "1k" },
  { id: "5000", label: "5k" },
  { id: "10000", label: "10k" },
  { id: "50000", label: "50k" },
];

const SHELLS: { id: string; label: string }[] = [
  { id: "", label: "System default" },
  { id: "/bin/zsh", label: "zsh" },
  { id: "/bin/bash", label: "bash" },
  ...(isMac ? [{ id: "/opt/homebrew/bin/fish", label: "fish (Homebrew)" }] : [{ id: "/usr/bin/fish", label: "fish" }]),
];

/**
 * Font family, scrollback and shell as choices first, raw values only under
 * Custom. Text commits on blur through the store's debounced path so a
 * half-typed path never reaches disk.
 */
export function AdvancedTerminal({ settings, update }: SettingsPaneProps) {
  const commit = useSettingsStore((s) => s.commit);
  const fontListed = FONTS.some((f) => f.id === settings.fontFamily);
  const shellListed = SHELLS.some((s) => s.id === (settings.defaultShell ?? ""));
  const scrollListed = SCROLLBACK.some((s) => s.id === String(settings.scrollbackLines));
  const [fontCustom, setFontCustom] = useState(!fontListed);
  const [shellCustom, setShellCustom] = useState(!shellListed);
  const [scrollCustom, setScrollCustom] = useState(!scrollListed);

  return (
    <div className="settings-group">
      <SettingRow label="Font family" stack={fontCustom}>
        <select
          className="input"
          aria-label="Font family"
          value={fontCustom ? CUSTOM : settings.fontFamily}
          onChange={(event) => {
            if (event.target.value === CUSTOM) return setFontCustom(true);
            setFontCustom(false);
            void update({ fontFamily: event.target.value });
          }}
        >
          {FONTS.map((f) => <option key={f.label} value={f.id}>{f.label}</option>)}
          <option value={CUSTOM}>Custom…</option>
        </select>
        {fontCustom && (
          <CommitInput label="Custom font stack" value={settings.fontFamily} placeholder="Any monospace stack installed on this machine" onCommit={(fontFamily) => commit({ fontFamily })} />
        )}
      </SettingRow>

      <SettingRow label="Scrollback" hint="Lines of history kept per terminal.">
        {scrollCustom ? (
          <CommitInput
            className="input input--sm"
            label="Scrollback lines"
            value={String(settings.scrollbackLines)}
            onCommit={(raw) => {
              const next = Math.min(100_000, Math.max(200, Number(raw) || 5000));
              commit({ scrollbackLines: next });
              if (SCROLLBACK.some((s) => s.id === String(next))) setScrollCustom(false);
            }}
          />
        ) : (
          <Segmented
            label="Scrollback"
            value={String(settings.scrollbackLines)}
            options={[...SCROLLBACK, { id: CUSTOM, label: "Custom" }]}
            onChange={(id) => (id === CUSTOM ? setScrollCustom(true) : void update({ scrollbackLines: Number(id) }))}
          />
        )}
      </SettingRow>

      <SettingRow label="Default shell" hint="Used for plain Terminal panes. Agents launch their own commands." stack={shellCustom}>
        <select
          className="input"
          aria-label="Default shell"
          value={shellCustom ? CUSTOM : settings.defaultShell ?? ""}
          onChange={(event) => {
            if (event.target.value === CUSTOM) return setShellCustom(true);
            setShellCustom(false);
            void update({ defaultShell: event.target.value || null });
          }}
        >
          {SHELLS.map((s) => <option key={s.label} value={s.id}>{s.label}</option>)}
          <option value={CUSTOM}>Custom…</option>
        </select>
        {shellCustom && (
          <CommitInput label="Custom shell path" value={settings.defaultShell ?? ""} placeholder="/usr/local/bin/nu" onCommit={(value) => commit({ defaultShell: value.trim() || null })} />
        )}
      </SettingRow>
    </div>
  );
}
