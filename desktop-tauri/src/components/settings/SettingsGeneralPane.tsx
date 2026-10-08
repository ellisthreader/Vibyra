import { computerName } from "../../lib/platform";
import type { Settings } from "../../types";
import { LanguageRow } from "./LanguageRow";
import { PerformanceRow } from "./PerformanceCard";
import { Segmented, Stepper } from "./SettingsControls";
import { SettingRow, SettingsBlock, type SettingsPaneProps } from "./SettingsShared";

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
            hint={`Default view on this ${computerName}. iPhone uses chat.`}
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
          <LanguageRow />
        </div>
      </SettingsBlock>

      <SettingsBlock label="Performance" panel="performance">
        <PerformanceRow settings={settings} update={update} />
      </SettingsBlock>


    </>
  );
}
