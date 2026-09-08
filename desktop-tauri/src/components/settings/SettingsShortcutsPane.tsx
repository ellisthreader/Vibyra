import { useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  DEFAULT_SCREENSHOT_SHORTCUT,
  DEFAULT_VOICE_SHORTCUT,
  shortcutFromEvent,
  shortcutLabel,
} from "../../lib/hotkeys";
import { setShortcutCaptureActive } from "../../lib/useGlobalShortcuts";
import { SettingRow, SettingsBlock, type SettingsPaneProps } from "./SettingsShared";

interface RecorderProps {
  defaultValue: string;
  label: string;
  otherValue: string;
  value: string;
  onChange: (value: string) => void;
}

function HotkeyRecorder({ defaultValue, label, otherValue, value, onChange }: RecorderProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");

  const finish = () => {
    setRecording(false);
    setShortcutCaptureActive(false);
  };

  useEffect(() => () => setShortcutCaptureActive(false), []);

  const start = () => {
    setError("");
    setRecording(true);
    setShortcutCaptureActive(true);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      finish();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      onChange(defaultValue);
      setError("");
      finish();
      return;
    }
    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;
    const shortcut = shortcutFromEvent(event.nativeEvent);
    if (!shortcut) {
      setError("Use F1–F24 or a modifier with a letter, number, or navigation key.");
      return;
    }
    if (shortcut === otherValue) {
      setError("That shortcut is already assigned to the other tool.");
      return;
    }
    setError("");
    onChange(shortcut);
    finish();
  };

  return (
    <div className="hotkey-recorder-wrap">
      <button
        type="button"
        className={`hotkey-recorder ${recording ? "hotkey-recorder--active" : ""}`}
        data-hotkey-recorder
        aria-label={`Set ${label} shortcut`}
        onClick={start}
        onKeyDown={onKeyDown}
        onBlur={finish}
      >
        {recording ? "Press shortcut…" : shortcutLabel(value)}
      </button>
      {value !== defaultValue && !recording ? (
        <button className="hotkey-reset" onClick={() => { setError(""); onChange(defaultValue); }}>Reset</button>
      ) : null}
      {error ? <span className="hotkey-error" role="alert">{error}</span> : null}
    </div>
  );
}

const APP_SHORTCUTS = [
  { label: "Open the command palette", keys: "Ctrl/Cmd + K" },
  { label: "Back to the home view", keys: "Ctrl/Cmd + Shift + H" },
  { label: "Focus terminal 1–9", keys: "Ctrl/Cmd + 1–9" },
  { label: "Show or hide the dock", keys: "Ctrl/Cmd + \\" },
  { label: "Cycle the dock size", keys: "Ctrl/Cmd + Shift + \\" },
  { label: "Dock: preview, chat, memory, files, review", keys: "Alt + 1–5" },
  { label: "Switch project 1–9", keys: "Ctrl/Cmd + Shift + 1–9" },
  { label: "Copy the terminal selection", keys: "Ctrl/Cmd + Shift + C" },
  { label: "Paste into the terminal", keys: "Ctrl/Cmd + Shift + V" },
  { label: "Send composer line", keys: "Enter" },
  { label: "New line in composer", keys: "Shift + Enter" },
];

export function SettingsShortcutsPane({ settings, update }: SettingsPaneProps) {
  return (
    <>
      <SettingsBlock label="System-wide tools">
        <div className="settings-group">
          <SettingRow label="Speech to terminal" hint="Press once to record and again to transcribe into the selected terminal">
            <HotkeyRecorder
              label="speech"
              value={settings.voiceShortcut}
              otherValue={settings.screenshotShortcut}
              defaultValue={DEFAULT_VOICE_SHORTCUT}
              onChange={(voiceShortcut) => void update({ voiceShortcut })}
            />
          </SettingRow>
          <SettingRow label="Screenshot editor" hint="Capture the display under the pointer, then crop, mark up, copy, or save">
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
      <SettingsBlock label="Inside Vibyra">
        <div className="settings-group">
          {APP_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} className="shortcut-row">
              <span>{shortcut.label}</span>
              <kbd className="kbd">{shortcut.keys}</kbd>
            </div>
          ))}
        </div>
      </SettingsBlock>
    </>
  );
}
