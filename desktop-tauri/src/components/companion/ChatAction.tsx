import type { ChatTurn } from "../../state/chatTypes";

/** One thing Vibyra did, as a line in the conversation.
 *
 * Shown rather than hidden: the assistant acting on the workspace is the
 * feature, and a person who can see "Opened 3 Codex terminals" knows what
 * happened without going to look. The detail underneath it is what the model
 * answers from; only the first line belongs on screen. */
export function ChatAction({ turn }: { turn: ChatTurn }) {
  return (
    <div className={`chat-did ${turn.tool?.failed ? "chat-did--failed" : ""}`}>
      <span className="chat-did__mark" aria-hidden="true">
        {turn.tool?.failed ? (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 5v4M8 11v.01" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 8.5 6.5 12 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="chat-did__text">{turn.tool?.summary}</span>
    </div>
  );
}
