import { plainText, type MarkdownDocument } from "../../lib/markdownDocument";
import type { ChatTurn } from "../../state/chatTypes";
import { CopyButton } from "../common/CopyButton";

import { SpeakReply } from "./ChatVoice";

/**
 * The row under a reply. It is hover-revealed rather than drawn permanently —
 * a bar of buttons under every bubble is somebody else's product — but its
 * height is reserved in `chatDesign.css` so nothing reflows mid-stream, and it
 * fades in on `:focus-within` too, so a keyboard reaches it on the first Tab.
 */
export function ChatMessageActions({
  turn,
  doc,
  active,
  onRetry,
}: {
  turn: ChatTurn;
  doc: MarkdownDocument;
  active: boolean;
  onRetry: (turnId: string) => void;
}) {
  // Stop settles the turn to `complete` a moment after marking it, so both
  // halves of "this reply is short on purpose" offer the same way back.
  const unfinished = turn.status === "failed" || Boolean(turn.stopped);
  return (
    <div className="chat-actions">
      {/* The markdown, not the rendering: what you paste is what it wrote. */}
      <CopyButton value={turn.content} label="Copy reply" done="Copied" compact />
      {unfinished && (
        <button type="button" className="chat-action" onClick={() => onRetry(turn.id)}>
          Retry
        </button>
      )}
      {/* Never half a reply, and never the pipes and asterisks around it. */}
      {turn.status === "complete" && <SpeakReply text={plainText(doc)} active={active} />}
    </div>
  );
}
