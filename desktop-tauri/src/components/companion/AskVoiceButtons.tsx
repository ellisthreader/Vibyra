import { useAskSpeechStore } from "../../state/askSpeechStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useVoiceStore } from "../../state/voiceStore";

// The three voice controls, kept together because they are one feature: talk
// to Ask, let Ask talk back, and hear any answer again.

function MicIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
    </svg>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5L6 9H3v6h3l5 4V5z" />
      {muted ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12" />}
    </svg>
  );
}

/** Push to talk, inside the composer. Shares the one recorder with F8. */
export function AskMicButton({ disabled }: { disabled: boolean }) {
  const phase = useVoiceStore((state) => state.phase);
  const sink = useVoiceStore((state) => state.sink);
  const toggle = useVoiceStore((state) => state.toggle);
  const live = sink === "ask" && (phase === "listening" || phase === "starting");

  return (
    <button
      type="button"
      className="ask-mic"
      data-live={live || undefined}
      aria-pressed={live}
      aria-label={live ? "Stop and send" : "Ask by voice"}
      title={live ? "Stop and send" : "Ask by voice"}
      disabled={disabled || phase === "transcribing"}
      onClick={() => toggle("ask")}
    >
      <MicIcon />
    </button>
  );
}

/** Whether replies are read aloud. Lives in the header, next to the identity. */
export function AskMuteToggle() {
  const speaks = useSettingsStore((state) => state.settings?.askSpeakReplies ?? true);
  const update = useSettingsStore((state) => state.update);
  const stop = useAskSpeechStore((state) => state.stop);

  return (
    <button
      type="button"
      className="icon-btn ask-mute"
      aria-pressed={speaks}
      aria-label={speaks ? "Mute spoken replies" : "Speak replies aloud"}
      title={speaks ? "Mute spoken replies" : "Speak replies aloud"}
      onClick={() => {
        if (speaks) stop();
        void update({ askSpeakReplies: !speaks });
      }}
    >
      <SpeakerIcon muted={!speaks} />
    </button>
  );
}

/** Hear one answer again, or stop the one playing. */
export function AskReplayButton({ turnKey, content }: { turnKey: string; content: string }) {
  const phase = useAskSpeechStore((state) => state.phase);
  const playing = useAskSpeechStore((state) => state.turnKey) === turnKey && phase !== "idle";
  const configured = useSettingsStore((state) => Boolean(state.settings?.openaiKeyConfigured));

  if (!configured) return null;
  return (
    <button
      type="button"
      className="ask-replay"
      data-live={playing || undefined}
      aria-label={playing ? "Stop speaking" : "Read this answer aloud"}
      title={playing ? "Stop speaking" : "Read this answer aloud"}
      onClick={() => {
        const speech = useAskSpeechStore.getState();
        if (playing) speech.stop();
        else void speech.speak(turnKey, content);
      }}
    >
      <SpeakerIcon muted={false} />
    </button>
  );
}
