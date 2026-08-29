import type { TranscriptBlock } from "../../lib/agentEventReducer";
import { ToolBlock } from "./ToolBlock";

/**
 * The transcript.
 *
 * Each event type gets a shape rather than a colour: a prompt is a right-set
 * bubble, an answer is plain prose, a tool is a bordered block that can be
 * folded away, a file change is a list, and a failure is the one thing with a
 * hue. Distinguishing six kinds of thing by tint alone would fail at a glance
 * and fail entirely for anyone who cannot separate the tints.
 */
export function AgentTranscript({
  chatId,
  blocks,
}: {
  chatId: string;
  blocks: readonly TranscriptBlock[];
}) {
  if (blocks.length === 0) {
    return (
      <p className="transcript__quiet">
        Nothing here yet. What you type stays in this chat; the agent keeps its brief, memory
        and skills across all of them.
      </p>
    );
  }

  return (
    <ol className="transcript" aria-label="Conversation" data-chat={chatId}>
      {blocks.map((block) => (
        <li key={block.id} className={`transcript__item transcript__item--${block.type}`}>
          {block.type === "prompt" && <p className="transcript__prompt">{block.text}</p>}

          {block.type === "assistant" && (
            <p className={`transcript__say ${block.streaming ? "is-streaming" : ""}`}>
              {block.text}
            </p>
          )}

          {block.type === "reasoning" && (
            <details className="transcript__thinking">
              <summary>Thinking</summary>
              <p>{block.text}</p>
            </details>
          )}

          {block.type === "tool" && <ToolBlock block={block} />}

          {block.type === "files" && (
            <div className="transcript__files">
              <p className="section-label">
                {block.paths.length === 1 ? "1 file changed" : `${block.paths.length} files changed`}
              </p>
              <ul>
                {block.paths.map((entry) => (
                  <li key={`${entry.path}-${entry.change}`}>
                    <span className={`transcript__change transcript__change--${entry.change}`}>
                      {entry.change}
                    </span>
                    <code>{entry.path}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {block.type === "notice" && (
            <p className={`transcript__notice transcript__notice--${block.tone}`}>{block.text}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
