import { useState } from "react";

import { keyCaps, isMac } from "../../lib/platform";
import { DEFAULT_SCREENSHOT_SHORTCUT, DEFAULT_TALK_SHORTCUT, DEFAULT_VOICE_SHORTCUT } from "../../lib/hotkeys";
import { KeyCaps } from "../common/KeyCaps";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { Disclosure } from "./SettingsControls";
import { SettingRow, SettingsBlock, type SettingsPaneProps } from "./SettingsShared";

const APP_SHORTCUTS = [
  { label: "Open Settings", keys: "Mod+," },
  { label: "Find a setting", keys: "Mod+F" },
  { label: "Open the command palette", keys: "Mod+K" },
  { label: "Back to the home view", keys: "Mod+Shift+H" },
  { label: "Focus terminal 1–9", keys: "Mod+1–9" },
  { label: "Switch project 1–9", keys: "Mod+Shift+1–9" },
  { label: "Paste text or an image into a terminal", keys: isMac ? "Mod+V" : "Ctrl+Shift+V" },
  { label: "Send composer line", keys: "Enter" },
  { label: "New line in composer", keys: "Shift+Enter" },
];

/** The three shortcuts you can change, then everything else as reference.
 *
 * Which voice answers, and how, is not a shortcut: it lives in
 * Settings > Advanced > Voice and speech with the rest of the voice controls. */
export function SettingsShortcutsPane({ settings, update }: SettingsPaneProps) {
  const [showAll, setShowAll] = useState(false);
  const { voiceShortcut, screenshotShortcut, talkShortcut } = settings;
  return (
    <>
      <SettingsBlock label="System-wide">
        <div className="settings-group">
          <SettingRow label="Voice typing" hint="Press once to record, again to type it into the focused terminal.">
            <HotkeyRecorder
              label="voice typing"
              value={voiceShortcut}
              otherValues={[screenshotShortcut, talkShortcut]}
              defaultValue={DEFAULT_VOICE_SHORTCUT}
              onChange={(next) => void update({ voiceShortcut: next })}
            />
          </SettingRow>
          <SettingRow
            label="Talk to Vibyra"
            hint="Opens the sidebar chat and talks: it listens, answers out loud, then listens again. Press again to end it."
          >
            <HotkeyRecorder
              label="talking to Vibyra"
              value={talkShortcut}
              otherValues={[voiceShortcut, screenshotShortcut]}
              defaultValue={DEFAULT_TALK_SHORTCUT}
              onChange={(next) => void update({ talkShortcut: next })}
            />
          </SettingRow>
          <SettingRow
            label="Screenshot"
            hint={isMac ? "Capture the main display, then crop, mark up, copy or save. Some keyboards need Fn with F9." : "Capture the display under the pointer, then crop, mark up, copy or save."}
          >
            <HotkeyRecorder
              label="screenshot"
              value={screenshotShortcut}
              otherValues={[voiceShortcut, talkShortcut]}
              defaultValue={DEFAULT_SCREENSHOT_SHORTCUT}
              onChange={(next) => void update({ screenshotShortcut: next })}
            />
          </SettingRow>
        </div>
      </SettingsBlock>

      <Disclosure title="All keyboard shortcuts" summary={`${APP_SHORTCUTS.length} inside Vibyra`} open={showAll} onToggle={setShowAll}>
        <div className="settings-group shortcut-grid">
          {APP_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} className="shortcut-row">
              <span>{shortcut.label}</span>
              <KeyCaps caps={keyCaps(shortcut.keys)} />
            </div>
          ))}
        </div>
      </Disclosure>
    </>
  );
}
