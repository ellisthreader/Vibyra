import { shortcutCaps } from "../../lib/hotkeys";
import { useSettingsStore } from "../../state/settingsStore";
import { useTalkStore, type TalkPhase } from "../../state/talkStore";
import { KeyCaps } from "../common/KeyCaps";
import { VoiceOrb } from "./VoiceOrb";

/** What each state says, in the order a person would ask it: what is happening,
 * and what should I do about it. */
const PROMPT: Record<TalkPhase, string> = {
  idle: "",
  listening: "Just talk. It answers when you pause.",
  thinking: "Working out an answer",
  speaking: "Say anything to interrupt",
  error: "",
};

/** Voice mode: the panel becomes one circle and one sentence.
 *
 * Deliberately unlike the chat page — no bubbles, no composer, no list — so
 * there is never a moment of wondering which mode you are in. The transcript
 * is one tap away and the conversation keeps running behind it.
 */
export function VoiceMode() {
  const { phase, title, sub, heard, level, end, setShowTranscript } = useTalkStore();
  const shortcut = useSettingsStore((state) => state.settings?.talkShortcut ?? "F10");
  const caption = phase === "speaking" ? sub : phase === "thinking" ? heard : "";

  return (
    <div className="voice-mode" data-phase={phase} role="region" aria-label="Voice conversation">
      <div className="voice-mode__stage">
        <VoiceOrb phase={phase} level={level} />
        <p className="voice-mode__state" role="status" aria-live="polite">{title}</p>
        {caption ? (
          <p className="voice-mode__caption" data-role={phase === "speaking" ? "reply" : "you"}>
            {phase === "thinking" ? <span className="voice-mode__who">You said</span> : null}
            {caption}
          </p>
        ) : (
          <p className="voice-mode__hint">{PROMPT[phase]}</p>
        )}
      </div>
      <div className="voice-mode__foot">
        <button type="button" className="voice-mode__end" onClick={end}>
          End conversation <KeyCaps caps={shortcutCaps(shortcut)} />
        </button>
        <button type="button" className="voice-mode__link" onClick={() => setShowTranscript(true)}>
          Show transcript
        </button>
      </div>
    </div>
  );
}

/** The strip that replaces voice mode while the transcript is showing: enough
 * to know it is still listening, and the way back to the circle. */
export function VoiceModeStrip() {
  const { phase, title, level, end, setShowTranscript } = useTalkStore();

  return (
    <div className="voice-strip" data-phase={phase}>
      <button type="button" className="voice-strip__back" onClick={() => setShowTranscript(false)} title="Back to the conversation">
        <span className="voice-strip__orb" style={{ "--level": level.toFixed(3) } as React.CSSProperties} aria-hidden="true" />
        <span className="voice-strip__state">{title}</span>
      </button>
      <button type="button" className="voice-strip__end" onClick={end}>End</button>
    </div>
  );
}
