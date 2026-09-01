import { useState } from "react";

import type { AgentProfile } from "../../agentTypes";
import type { TranscriptBlock } from "../../lib/agentEventReducer";
import { toolElapsed } from "../../lib/agentToolShape.ts";
import { writeClipboardText } from "../../ipc/tools";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";

/**
 * What a turn cost, and the three things to do about it.
 *
 * The numbers were already being computed and thrown away — the reducer has
 * folded `usage.updated` since Agent Mode shipped and nothing read it. Cost
 * per turn is the figure that changes how someone works, so it belongs where
 * the turn ends rather than in a settings pane totalling the month.
 *
 * Retry appends; it does not replace. Branching a transcript is a real feature
 * with real storage consequences, and an append dressed up as a branch is
 * worse than not having one.
 */
function tokens(count: number): string {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
}

export function TurnFooter({
  block,
  agent,
  chatId,
  answer,
}: {
  block: Extract<TranscriptBlock, { type: "footer" }>;
  agent: AgentProfile | null;
  chatId: string;
  /** The answer this turn produced, for Copy. Empty when it produced none. */
  answer: string;
}) {
  const send = useAgentChatStore((state) => state.send);
  const running = useAgentChatStore((state) => Boolean(state.running[chatId]));
  const setDraft = useAgentModeStore((state) => state.setDraft);
  const [copied, setCopied] = useState(false);

  const elapsed = block.elapsedMs === null ? "" : toolElapsed(0, block.elapsedMs);
  const engine = agent ? (agent.engine === "claude" ? "claude" : "codex") : "";
  const model = agent?.model ?? "";

  const copy = async () => {
    if (!answer) return;
    try {
      await writeClipboardText(answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_400);
    } catch {
      // The text is on screen and selectable; a toast would be louder than
      // the problem.
    }
  };

  return (
    <div className="turn-foot">
      {engine && (
        <span className="turn-foot__engine">
          {engine}
          {model ? ` · ${model}` : ""}
        </span>
      )}
      {elapsed && <span>{elapsed}</span>}
      <span>
        {tokens(block.inputTokens)} in · {tokens(block.outputTokens)} out
      </span>
      {block.costUsd !== null && <span>${block.costUsd.toFixed(block.costUsd < 1 ? 3 : 2)}</span>}
      <span className="turn-foot__acts">
        {answer && (
          <button type="button" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        {block.prompt && (
          <>
            <button
              type="button"
              disabled={running}
              title="Send this prompt again, as a new turn"
              onClick={() => void send(chatId, block.prompt)}
            >
              Retry
            </button>
            <button
              type="button"
              className="turn-foot__edit"
              title="Put this prompt back in the composer"
              onClick={() => setDraft({ chatId, text: block.prompt })}
            >
              Edit &amp; resend
            </button>
          </>
        )}
      </span>
    </div>
  );
}
