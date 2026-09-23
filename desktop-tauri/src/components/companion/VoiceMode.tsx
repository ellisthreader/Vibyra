import { useLayoutEffect, useRef } from "react";

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

/** The circle, subscribed on its own: the meter level changes every 120 ms
 * while listening, and only the orb draws it — not the caption, the buttons
 * or the shortcut caps around it. */
function LiveVoiceOrb({ phase }: { phase: TalkPhase }) {
  const level = useTalkStore((state) => state.level);
  return <VoiceOrb phase={phase} level={level} />;
}

/** Voice mode: the panel becomes one circle and one sentence.
 *
 * Deliberately unlike the chat page — no bubbles, no composer, no list — so
 * there is never a moment of wondering which mode you are in. The transcript
 * is one tap away and the conversation keeps running behind it.
 */
export function VoiceMode() {
  const phase = useTalkStore((state) => state.phase);
  const title = useTalkStore((state) => state.title);
  const sub = useTalkStore((state) => state.sub);
  const heard = useTalkStore((state) => state.heard);
  const end = useTalkStore((state) => state.end);
  const setShowTranscript = useTalkStore((state) => state.setShowTranscript);
  const shortcut = useSettingsStore((state) => state.settings?.talkShortcut ?? "F10");
  const caption = phase === "speaking" ? sub : phase === "thinking" ? heard : "";

  return (
    <div className="voice-mode" data-phase={phase} role="region" aria-label="Voice conversation">
      <div className="voice-mode__stage">
        <LiveVoiceOrb phase={phase} />
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
  const phase = useTalkStore((state) => state.phase);
  const title = useTalkStore((state) => state.title);
  const end = useTalkStore((state) => state.end);
  const setShowTranscript = useTalkStore((state) => state.setShowTranscript);
  const orb = useRef<HTMLSpanElement>(null);
  // The meter is polled every 120 ms while listening. It is one custom
  // property, so it is written straight onto the dot instead of rendering.
  useLayoutEffect(() => {
    const write = (level: number) => orb.current?.style.setProperty("--level", level.toFixed(3));
    write(useTalkStore.getState().level);
    return useTalkStore.subscribe((state, previous) => {
      if (state.level !== previous.level) write(state.level);
    });
  }, []);

  return (
    <div className="voice-strip" data-phase={phase}>
      <button type="button" className="voice-strip__back" onClick={() => setShowTranscript(false)} title="Back to the conversation">
        <span className="voice-strip__orb" ref={orb} aria-hidden="true" />
        <span className="voice-strip__state">{title}</span>
      </button>
      <button type="button" className="voice-strip__end" onClick={end}>End</button>
    </div>
  );
}
