import { shortcutLabel } from "../../lib/hotkeys";
import { useSettingsStore } from "../../state/settingsStore";
import { useVoiceStore } from "../../state/voiceStore";
import { VoicePulse } from "./VoicePulse";

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 8v5M12 16.5v.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function VoiceHud() {
  const { phase, title, sub, cancel } = useVoiceStore();
  const shortcut = useSettingsStore((state) => state.settings?.voiceShortcut ?? "F8");

  if (phase === "idle") return null;

  return (
    <div className="voice-hud" data-phase={phase} role="status">
      <span className="voice-hud__mark">
        {phase === "listening" ? (
          <VoicePulse />
        ) : phase === "transcribing" || phase === "starting" ? (
          <span className="voice-hud__spinner" aria-hidden="true" />
        ) : phase === "sent" ? (
          <CheckIcon />
        ) : phase === "error" ? (
          <AlertIcon />
        ) : (
          <MicIcon />
        )}
      </span>
      <span className="voice-hud__copy">
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
      <span className="voice-hud__key">
        <kbd>{shortcutLabel(shortcut)}</kbd>
      </span>
      {(phase === "listening" || phase === "starting") && (
        <button className="icon-btn" title="Cancel" onClick={cancel}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
