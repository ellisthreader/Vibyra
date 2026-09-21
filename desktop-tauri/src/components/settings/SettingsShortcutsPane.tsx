import { useState } from "react";

import { keyLabel, isMac } from "../../lib/platform";
import { DEFAULT_SCREENSHOT_SHORTCUT, DEFAULT_VOICE_SHORTCUT } from "../../lib/hotkeys";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { Disclosure } from "./SettingsControls";
import { SettingRow, SettingsBlock, type SettingsPaneProps } from "./SettingsShared";

const APP_SHORTCUTS = [
  { label: "Open Settings", keys: keyLabel("Mod+,") },
  { label: "Find a setting", keys: keyLabel("Mod+F") },
  { label: "Open the command palette", keys: keyLabel("Mod+K") },
  { label: "Back to the home view", keys: keyLabel("Mod+Shift+H") },
  { label: "Focus terminal 1–9", keys: keyLabel("Mod+1–9") },
  { label: "Switch project 1–9", keys: keyLabel("Mod+Shift+1–9") },
  { label: "Paste text or an image into a terminal", keys: isMac ? "⌘V" : "Ctrl Shift V" },
  { label: "Send composer line", keys: "Enter" },
  { label: "New line in composer", keys: keyLabel("Shift+Enter") },
];

/** The two shortcuts you can change, then everything else as reference. */
export function SettingsShortcutsPane({ settings, update }: SettingsPaneProps) {
  const [showAll, setShowAll] = useState(false);
  return (
    <>
      <SettingsBlock label="System-wide" note="These work in any app while Vibyra is running.">
        <div className="settings-group">
          <SettingRow label="Voice typing" hint="Press once to record, again to type it into the focused terminal.">
            <HotkeyRecorder
              label="voice typing"
              value={settings.voiceShortcut}
              otherValue={settings.screenshotShortcut}
              defaultValue={DEFAULT_VOICE_SHORTCUT}
              onChange={(voiceShortcut) => void update({ voiceShortcut })}
            />
          </SettingRow>
          <SettingRow
            label="Screenshot"
            hint={isMac ? "Capture the main display, then crop, mark up, copy or save. Some keyboards need Fn with F9." : "Capture the display under the pointer, then crop, mark up, copy or save."}
          >
            <HotkeyRecorder
              label="screenshot"
              value={settings.screenshotShortcut}
              otherValue={settings.voiceShortcut}
              defaultValue={DEFAULT_SCREENSHOT_SHORTCUT}
              onChange={(screenshotShortcut) => void update({ screenshotShortcut })}
            />
          </SettingRow>
        </div>
      </SettingsBlock>

      <Disclosure title="All keyboard shortcuts" summary={`${APP_SHORTCUTS.length} inside Vibyra`} open={showAll} onToggle={setShowAll}>
        <div className="settings-group">
          {APP_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} className="shortcut-row">
              <span>{shortcut.label}</span>
              <kbd className="kbd">{shortcut.keys}</kbd>
            </div>
          ))}
        </div>
      </Disclosure>
    </>
  );
}
