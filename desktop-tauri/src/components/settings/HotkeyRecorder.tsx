import { useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { shortcutFromEvent, shortcutLabel } from "../../lib/hotkeys";
import { setShortcutCaptureActive } from "../../lib/useGlobalShortcuts";

interface Props {
  defaultValue: string;
  label: string;
  otherValue: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Shows the current key and a Change affordance; only while recording does it
 * ask for a press. Escape cancels, Backspace/Delete restores the default, and
 * global shortcuts are suspended for the length of the recording so the key
 * being chosen does not fire the tool it belongs to.
 */
export function HotkeyRecorder({ defaultValue, label, otherValue, value, onChange }: Props) {
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
    if (event.key === "Escape") return finish();
    if (event.key === "Backspace" || event.key === "Delete") {
      onChange(defaultValue);
      setError("");
      return finish();
    }
    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;
    const shortcut = shortcutFromEvent(event.nativeEvent);
    if (!shortcut) return setError("Use F1–F24 or a modifier with a letter, number, or navigation key.");
    if (shortcut === otherValue) return setError("That shortcut is already assigned to the other tool.");
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
        aria-label={`Set ${label} shortcut, currently ${shortcutLabel(value)}`}
        onClick={start}
        onKeyDown={onKeyDown}
        onBlur={finish}
      >
        {recording ? "Press a shortcut…" : (
          <>
            <kbd className="kbd hotkey-recorder__key">{shortcutLabel(value)}</kbd>
            <span className="hotkey-recorder__change">Change</span>
          </>
        )}
      </button>
      {value !== defaultValue && !recording ? (
        <button className="hotkey-reset" onClick={() => { setError(""); onChange(defaultValue); }}>Reset</button>
      ) : null}
      {error ? <span className="hotkey-error" role="alert">{error}</span> : null}
    </div>
  );
}
