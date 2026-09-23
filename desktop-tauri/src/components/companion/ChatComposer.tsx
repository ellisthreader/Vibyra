import { useEffect, useRef } from "react";

import { SendIcon } from "../common/Icons";

import { ChatVoiceStart } from "./ChatVoiceStart";

/** The composer. Send becomes Stop while a reply is in flight — the store
 * refuses a second question anyway, so a disabled Send would just be a button
 * that does nothing where the useful one belongs.
 *
 * Two voice controls, because they do different things: dictation writes into
 * the draft you then edit, and the conversation answers out loud. They read as
 * one icon twice, so `chatDesign.css` tints the conversation one — the plain
 * microphone puts words in the box, the cobalt one starts a conversation. */
export function ChatComposer({
  draft,
  setDraft,
  serviceConfigured,
  sending,
  elsewhere,
  onSubmit,
  onStop,
}: {
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
  const field = useRef<HTMLTextAreaElement>(null);
  // A sent or cleared draft gives the box its one row back, whichever of the
  // composer, a starter or the store emptied it.
  useEffect(() => {
    if (!draft && field.current) field.current.style.height = "";
  }, [draft]);

  const hint = elsewhere
    ? `A reply is still streaming in ${elsewhere}`
    : serviceConfigured
      ? "Shift + Enter for a new line"
      : "Needs an OpenAI key";

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
        onInput={(event) => {
          const box = event.currentTarget;
          box.style.height = "auto";
          box.style.height = `${Math.min(box.scrollHeight, 120)}px`;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="chat-composer-tools">
        <span title="Enter to send · Shift + Enter for a new line">{hint}</span>
        <ChatVoiceStart disabled={!serviceConfigured} />
        {sending || elsewhere ? (
          <button
            className="chat-input__send chat-input__send--stop"
            aria-label="Stop the reply"
            title="Stop"
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
