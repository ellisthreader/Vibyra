import { shortcutLabel } from "../../lib/hotkeys";
import type { Settings } from "../../types";
import { GraphicsCard } from "./GraphicsCard";
import { SettingRow, SettingsBlock, Switch, type SettingsPaneProps } from "./SettingsShared";

const THEMES: { id: Settings["theme"]; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
];

function ThemeCards({ settings, update }: SettingsPaneProps) {
  return (
    <div className="theme-cards" role="radiogroup" aria-label="Theme">
      {THEMES.map((option) => (
        <button key={option.id} role="radio" aria-checked={settings.theme === option.id} className={`theme-card ${settings.theme === option.id ? "theme-card--active" : ""}`} onClick={() => void update({ theme: option.id })}>
          <span className={`theme-card__swatch theme-card__swatch--${option.id}`}><i /></span>
          <span className="theme-card__label">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export function SettingsGeneralPane({ settings, update }: SettingsPaneProps) {
  return (
    <>
      <SettingsBlock label="Theme"><ThemeCards settings={settings} update={update} /></SettingsBlock>
      <SettingsBlock label="Terminal">
        <div className="settings-group">
          <SettingRow label="Font size" hint="Terminal text size in pixels">
            <input className="input input--sm" type="number" min={9} max={24} value={settings.fontSize} onChange={(event) => void update({ fontSize: Number(event.target.value) || 13 })} />
          </SettingRow>
          <SettingRow label="Scrollback" hint="Lines of history kept per terminal">
            <input className="input input--sm" type="number" min={200} max={100000} step={100} value={settings.scrollbackLines} onChange={(event) => void update({ scrollbackLines: Number(event.target.value) || 5000 })} />
          </SettingRow>
          <SettingRow label="Font family" hint="Any monospace stack installed on this machine" stack>
            <input className="input" value={settings.fontFamily} onChange={(event) => void update({ fontFamily: event.target.value })} spellCheck={false} />
          </SettingRow>
          <SettingRow label="Default shell" hint="Blank uses the system shell" stack>
            <input className="input" value={settings.defaultShell ?? ""} placeholder="/bin/zsh" onChange={(event) => void update({ defaultShell: event.target.value || null })} spellCheck={false} />
          </SettingRow>
        </div>
      </SettingsBlock>
      <GraphicsCard settings={settings} update={update} />
      <SettingsBlock label="Folders">
        <div className="settings-group">
          <SettingRow label="Workspace root" hint="New terminals start here when a project doesn't set its own folder" stack>
            <input className="input" value={settings.workspaceRoot ?? ""} placeholder="~/Projects" onChange={(event) => void update({ workspaceRoot: event.target.value || null })} spellCheck={false} />
          </SettingRow>
          <SettingRow label="Screenshot folder" hint={<>Where <kbd className="kbd">{shortcutLabel(settings.screenshotShortcut)}</kbd> captures are saved — blank uses ~/Pictures/Vibyra</>} stack>
            <input className="input" value={settings.screenshotDir ?? ""} placeholder="~/Pictures/Vibyra" onChange={(event) => void update({ screenshotDir: event.target.value || null })} spellCheck={false} />
          </SettingRow>
          <SettingRow label="Hide Vibyra in captures" hint="Off captures the screen exactly as it is. On asks the compositor to take Vibyra out of the shot, which costs a compositor frame per capture and needs a compositing window manager.">
            <Switch label="Hide Vibyra in captures" checked={settings.screenshotHideWindow} onChange={(next) => void update({ screenshotHideWindow: next })} />
          </SettingRow>
        </div>
      </SettingsBlock>
      <SettingsBlock label="Saved sessions">
        <div className="settings-group">
          <SettingRow label="Restore terminal output" hint="Your open terminals and layout always come back. This also saves the last of each terminal's output so you can read where you left off — turn it off if this machine is shared, and restored terminals will reopen blank.">
            <Switch label="Restore terminal output" checked={settings.persistTerminalScrollback} onChange={(next) => void update({ persistTerminalScrollback: next })} />
          </SettingRow>
        </div>
      </SettingsBlock>
    </>
  );
}
