import { computerName } from "../../lib/platform";
import type { Settings } from "../../types";
import { ClearWorkspaceRow } from "./ClearWorkspaceRow";
import { PerformanceRow } from "./PerformanceCard";
import { ProjectContextRow } from "./ProjectContextRow";
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
            hint={`How a launched agent opens on this ${computerName}. Your iPhone always shows a chat.`}
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

      <SettingsBlock label="Privacy" panel="privacy">
        <div className="settings-group">
          <ProjectContextRow settings={settings} update={update} />
          <SettingRow
            label="Restore terminal output"
            hint={`Saves each terminal's visible output to this ${computerName} so panes reopen as you left them. When off, only the layout is kept and restored terminals reopen blank.`}
          >
            <Switch
              checked={settings.persistTerminalScrollback}
              label="Restore terminal output"
              onChange={(persistTerminalScrollback) => void update({ persistTerminalScrollback })}
            />
          </SettingRow>
          <ClearWorkspaceRow />
        </div>
      </SettingsBlock>
    </>
  );
}
