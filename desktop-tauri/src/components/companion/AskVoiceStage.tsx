import { useAskStore } from "../../state/askStore";
import { useAskSpeechStore } from "../../state/askSpeechStore";
import { useVoiceStore } from "../../state/voiceStore";
import { AskVoiceOrb, type OrbMode } from "./AskVoiceOrb";

/**
 * The live state of a spoken exchange, shown where the answer will land.
 *
 * One stage covers the whole round trip — listening, transcribing, reading the
 * workspace, speaking — because to the user it is a single conversation, not
 * four subsystems. The orb changes colour at the one moment that matters: when
 * the turn passes from you to Vibyra.
 */

interface Stage {
  mode: OrbMode;
  caption: string;
  action: { label: string; run: () => void } | null;
}

function stage(): Stage {
  const voice = useVoiceStore.getState();
  const speech = useAskSpeechStore.getState();
  const cancel = { label: "Cancel", run: () => useVoiceStore.getState().cancel() };

  if (voice.sink === "ask" && voice.phase !== "idle" && voice.phase !== "sent") {
    if (voice.phase === "listening") {
      return {
        mode: "listening",
        caption: "Listening",
        action: { label: "Stop and send", run: () => useVoiceStore.getState().toggle("ask") },
      };
    }
    if (voice.phase === "error") return { mode: "thinking", caption: voice.title, action: null };
    const opening = voice.phase === "starting";
    return {
      mode: "thinking",
      caption: opening ? "Opening microphone" : "Transcribing",
      action: opening ? cancel : null,
    };
  }

  if (speech.phase === "speaking") {
    return {
      mode: "speaking",
      caption: "Speaking",
      action: { label: "Stop", run: () => useAskSpeechStore.getState().stop() },
    };
  }
  if (speech.phase === "loading") {
    return { mode: "thinking", caption: "Finding the words", action: null };
  }
  if (useAskStore.getState().sending) {
    return { mode: "thinking", caption: "Reading your workspace", action: null };
  }
  return { mode: "idle", caption: "", action: null };
}

export function AskVoiceStage() {
  // Subscribed to the three stores that can move the stage; `stage` then reads
  // them together, so the precedence between them lives in one place.
  useVoiceStore((state) => `${state.phase}:${state.sink}`);
  useAskSpeechStore((state) => state.phase);
  useAskStore((state) => state.sending);
  const analyser = useAskSpeechStore((state) => state.analyser);

  const { mode, caption, action } = stage();
  if (mode === "idle") return null;

  return (
    <div className="ask-stage" data-mode={mode} role="status" aria-live="polite">
      <AskVoiceOrb mode={mode} analyser={analyser} />
      <p className="ask-stage__caption">{caption}</p>
      {action && (
        <button type="button" className="ask-stage__action" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  );
}
