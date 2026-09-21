import type { Settings } from "../../types";
import { PerformanceRow } from "./PerformanceCard";
import { Segmented, Stepper } from "./SettingsControls";
import { SettingRow, SettingsBlock, Switch, type SettingsPaneProps } from "./SettingsShared";

const THEMES: { id: Settings["theme"]; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
];

const VIEWS: { id: Settings["agentView"]; label: string }[] = [
  { id: "terminal", label: "Terminal" },
  { id: "chat", label: "Chat" },
];

/**
 * The page Settings opens on. Three groups, no scrolling at the modal's own
 * size: what it looks like, whether it runs lean, and the one choice with a
 * privacy consequence. Fonts, shells, folders and graphics live in Advanced.
 */
export function SettingsGeneralPane({ settings, update }: SettingsPaneProps) {
  return (
    <>
      <SettingsBlock label="Appearance" panel="appearance">
        <div className="settings-group">
          <SettingRow label="Theme">
            <Segmented label="Theme" value={settings.theme} options={THEMES} onChange={(theme) => void update({ theme })} />
          </SettingRow>
          <SettingRow
            label="Agent view"
            hint="How a launched agent opens on this Mac. Your iPhone always shows a chat."
          >
            <Segmented
              label="Agent view"
              value={settings.agentView === "chat" ? "chat" : "terminal"}
              options={VIEWS}
              onChange={(agentView) => void update({ agentView })}
            />
          </SettingRow>
          <SettingRow label="Terminal text size">
            <Stepper
              label="Terminal text size"
              value={settings.fontSize}
              min={9}
              max={24}
              suffix="px"
              onChange={(fontSize) => void update({ fontSize })}
            />
          </SettingRow>
        </div>
      </SettingsBlock>

      <SettingsBlock label="Performance" panel="performance">
        <PerformanceRow settings={settings} update={update} />
      </SettingsBlock>

      <SettingsBlock label="Privacy">
        <div className="settings-group">
          <SettingRow
            label="Restore terminal output"
            hint="Reopen recent terminal output on this device. Turn it off on a shared Mac; restored terminals then reopen blank."
          >
            <Switch
              checked={settings.persistTerminalScrollback}
              label="Restore terminal output"
              onChange={(persistTerminalScrollback) => void update({ persistTerminalScrollback })}
            />
          </SettingRow>
        </div>
      </SettingsBlock>
    </>
  );
}
