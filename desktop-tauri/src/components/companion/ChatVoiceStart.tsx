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
      className={`chat-voice-button chat-voice-start ${live ? "is-talking" : ""}`}
      aria-label={live ? "End the voice conversation" : "Start a voice conversation"}
      title={live ? "End the voice conversation" : "Talk to Vibyra"}
      aria-pressed={live}
      disabled={disabled && !live}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" strokeLinecap="round" />
      </svg>
      <span>{live ? 'End voice' : 'Voice'}</span>
    </button>
  );
}
