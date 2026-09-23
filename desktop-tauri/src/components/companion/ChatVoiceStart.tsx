import { useTalkStore } from "../../state/talkStore";

/** Starts a conversation from the composer, for anyone who would rather click
 * than learn a key. The same control ends it, so there is never a second one. */
export function ChatVoiceStart({ disabled }: { disabled: boolean }) {
  const phase = useTalkStore((state) => state.phase);
  const toggle = useTalkStore((state) => state.toggle);
  const live = phase !== "idle" && phase !== "error";

  return (
    <button
      type="button"
      className={`chat-voice-button ${live ? "is-talking" : ""}`}
      aria-label={live ? "End the voice conversation" : "Start a voice conversation"}
      title={live ? "End the voice conversation" : "Talk to Vibyra"}
      aria-pressed={live}
      disabled={disabled && !live}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M12 3.5a2.6 2.6 0 0 1 2.6 2.6v4.8a2.6 2.6 0 0 1-5.2 0V6.1A2.6 2.6 0 0 1 12 3.5Z" />
        <path d="M5.6 10.9a6.4 6.4 0 0 0 12.8 0M12 17.3v3.2" />
        <path d="M20.9 5.6a5.2 5.2 0 0 1 0 5.8" />
      </svg>
    </button>
  );
}
