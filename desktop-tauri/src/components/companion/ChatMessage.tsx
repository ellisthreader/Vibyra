import { memo, useMemo } from "react";

import { parseMarkdownDocument } from "../../lib/markdownDocument";
import type { ChatTurn } from "../../state/chatTypes";
import { VibyraMark } from "../common/VibyraMark";
import { MarkdownBlocks } from "../markdown/MarkdownBlocks";

import { ChatMessageActions } from "./ChatMessageActions";

const STREAMING = { streaming: true } as const;

/**
 * One turn. Memoised because a delta repaints the thread about sixty times a
 * second and only the last turn has changed — and the parse is memoised inside
 * it because a full re-parse per delta is what keeps the render flicker-free.
 */
export const ChatMessage = memo(function ChatMessage({
  turn,
  active,
  speaking,
  onRetry,
  onRun,
}: {
  turn: ChatTurn;
  active: boolean;
  speaking: boolean;
  onRetry: (turnId: string) => void;
  onRun?: (command: string, lines: string[]) => void | Promise<boolean>;
}) {
  const streaming = turn.status === "streaming";
  // Streaming mode withholds a trailing partial run, so a settled reply is
  // parsed once more without it: otherwise a tail that ended mid-emphasis
  // would stay hidden for good.
  const doc = useMemo(
    () => parseMarkdownDocument(turn.content, streaming ? STREAMING : undefined),
    [turn.content, streaming],
  );

  // The question keeps its own line breaks; only a reply is markup.
  if (turn.role === "user")
    return (
      <div className="chat-turn chat-turn--user">
        <div className="chat-turn__bubble">{turn.content}</div>
      </div>
    );

  // A failure that wrote nothing is not a reply. Drawing an empty bubble for it
  // would read as an answer nobody gave, so it says what went wrong instead.
  if (turn.status === "failed" && !turn.content)
    return (
      <div className="chat-turn chat-turn--failed">
        <p className="chat-error" role="alert">
          {turn.error ?? "The reply could not be finished."}
        </p>
        <button type="button" className="chat-action" onClick={() => onRetry(turn.id)}>
          Retry
        </button>
      </div>
    );

  const classes = `chat-turn chat-turn--assistant${speaking ? " chat-turn--speaking" : ""}`;
  // `aria-busy` keeps the surrounding `role="log"` from reading a reply out
  // token by token; `ChatPanel` announces the finished one once instead.
  const mark = (
    <span className="chat-turn__token">
      <VibyraMark size={22} />
    </span>
  );

  // `reasoning_effort: "minimal"` still pauses before the first token, and an
  // empty bubble with a caret in it reads as broken rather than as thinking.
  if (streaming && !turn.content)
    return (
      <div className={classes} aria-busy>
        {mark}
        <div className="chat-turn__bubble chat-turn__bubble--thinking">
          <i />
          <i />
          <i />
        </div>
      </div>
    );

  return (
    <div className={classes} aria-busy={streaming || undefined}>
      {mark}
      <div className="chat-turn__bubble">
        <MarkdownBlocks doc={doc} headingOffset={3} onRun={onRun} />
        {/* A steady bar, never a blink: a loop would need a `performance.css`
            exemption for worse feedback than a still mark beside moving text. */}
        {streaming && <span className="chat-caret" aria-hidden="true" />}
        <ChatMessageActions turn={turn} doc={doc} active={active} onRetry={onRetry} />
      </div>
    </div>
  );
});
