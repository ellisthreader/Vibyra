import { memo } from "react";

import type { AgentProfile } from "../../agentTypes";
import type { TranscriptBlock } from "../../lib/agentEventReducer";
import { AnswerBlock } from "./AnswerBlock";
import { AppliedSkills } from "./AppliedSkills";
import { ChangedFiles } from "./ChangedFiles";
import { ToolBlock } from "./ToolBlock";
import { TurnFooter } from "./TurnFooter";

/**
 * The transcript.
 *
 * Each event type gets a shape rather than a colour: a prompt is a set-in
 * block, an answer is rendered prose, a tool is a bordered block that can be
 * folded away, a file change opens into its diff, and a failure is the one
 * thing with a hue. Distinguishing six kinds of thing by tint alone would fail
 * at a glance and fail entirely for anyone who cannot separate the tints.
 *
 * Memoized, and every block below it too. A streaming turn writes one store
 * update per animation frame; without this, each of those frames re-created
 * the elements for every block in the conversation, and the scroll effect then
 * measured the lot. The list is the part that has to stay cheap as a chat gets
 * long — a two-hour conversation is hundreds of blocks, and only ever one of
 * them is changing.
 *
 * The single pass also carries the last answer forward to the footer, which is
 * what Copy copies. A footer cannot find its own answer: `settleAssistant`
 * keys the settled block by `seq`, not by turn.
 */
export const AgentTranscript = memo(function AgentTranscript({
  chatId,
  blocks,
  agent,
}: {
  chatId: string;
  blocks: readonly TranscriptBlock[];
  agent: AgentProfile | null;
}) {
  if (blocks.length === 0) {
    return (
      <p className="transcript__quiet">
        Nothing here yet. What you type stays in this chat; the agent keeps its brief, memory
        and skills across all of them.
      </p>
    );
  }

  let lastAnswer = "";

  return (
    <ol className="transcript" aria-label="Conversation" data-chat={chatId}>
      {blocks.map((block) => {
        if (block.type === "assistant") lastAnswer = block.text;
        const answer = lastAnswer;
        return (
          <li key={block.id} className={`transcript__item transcript__item--${block.type}`}>
            {block.type === "prompt" && <p className="transcript__prompt">{block.text}</p>}

            {block.type === "assistant" && (
              <AnswerBlock text={block.text} streaming={block.streaming} />
            )}

            {block.type === "reasoning" && (
              <details className="transcript__thinking">
                <summary>Thinking</summary>
                <p>{block.text}</p>
              </details>
            )}

            {block.type === "skills" && <AppliedSkills applied={block.applied} />}

            {block.type === "tool" && <ToolBlock block={block} />}

            {block.type === "files" && (
              <ChangedFiles entries={block.paths} agentId={agent?.id ?? null} />
            )}

            {block.type === "footer" && (
              <TurnFooter block={block} agent={agent} chatId={chatId} answer={answer} />
            )}

            {block.type === "notice" && (
              <p className={`transcript__notice transcript__notice--${block.tone}`}>{block.text}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
});
