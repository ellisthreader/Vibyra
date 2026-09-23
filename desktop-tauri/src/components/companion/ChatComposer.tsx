import { SendIcon } from "../common/Icons";
import { ChatVoiceStart } from "./ChatVoiceStart";
import { useComposerSize } from './useComposerSize';

/** One voice entry point; Send becomes Stop while a reply is in flight. */
export function ChatComposer({
  active,
  draft,
  setDraft,
  serviceConfigured,
  sending,
  elsewhere,
  onSubmit,
  onStop,
}: {
  active: boolean;
  draft: string;
  setDraft: (text: string) => void;
  serviceConfigured: boolean;
  /** A spoken conversation is running behind this transcript. */
  sending: boolean;
  /** The project a reply is still streaming into, when it is not this one. */
  elsewhere: string | null;
  onSubmit: () => void;
  onStop: () => void;
}) {
  const field = useComposerSize(draft, active);

  const hint = elsewhere
    ? `A reply is still streaming in ${elsewhere}`
    : sending ? 'Vibyra is working…' : 'Enter to send · Shift + Enter for a new line';

  return (
    <div className="chat-input">
      <textarea
        ref={field}
        className="chat-input__area"
        value={draft}
        rows={1}
        placeholder="Message Vibyra…"
        aria-label="Message Vibyra"
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
            event.preventDefault();
            if (!sending && !elsewhere) onSubmit();
          }
        }}
      />
      <div className="chat-composer-tools">
        <ChatVoiceStart disabled={!serviceConfigured} />
        <span className="chat-composer-hint" title={hint}>{elsewhere ? `Replying in ${elsewhere}` : sending ? 'Working…' : '↵ Send'}</span>
        {sending || elsewhere ? (
          <button
            className="chat-input__send chat-input__send--stop"
            aria-label="Stop the reply"
            title={elsewhere ? `Stop the reply in ${elsewhere}` : 'Stop the reply'}
            onClick={onStop}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button
            className="chat-input__send"
            aria-label="Send message"
            title="Send"
            onClick={onSubmit}
            disabled={!draft.trim()}
          >
            <SendIcon size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
