import type { ChatTurn } from "../../state/chatTypes";
import { SparklesIcon } from "../common/Icons";
import { VibyraMark } from "../common/VibyraMark";

import { ChatAction } from "./ChatAction";
import { ChatMessage } from "./ChatMessage";

const STARTERS = [
  {
    label: "Explain this project",
    prompt: "Give me a concise overview of this project, its main entry points, and how the pieces fit together.",
  },
  {
    label: "Choose the next useful task",
    prompt: "Review this project and suggest the smallest useful next task, with a clear reason.",
  },
];

/** Everything inside the scroller: the opening, the thread, and the one notice
 * the panel has left to show after the failed turns have shown their own. */
export function ChatTurns({
  turns,
  active,
  speakingTurn,
  notice,
  onStart,
  onRetry,
  onRun,
}: {
  turns: ChatTurn[];
  active: boolean;
  speakingTurn: string | null;
  notice: string;
  onStart: (prompt: string) => void;
  onRetry: (turnId: string) => void;
  onRun?: (command: string, lines: string[]) => void | Promise<boolean>;
}) {
  return (
    <>
      {turns.length === 0 && (
        <div className="chat-empty">
          <div className="chat-empty__mark">
            <VibyraMark size={40} label="Vibyra" />
          </div>
          <h3>What are we building?</h3>
          <p>A question, an idea, a place to start.</p>
          <div className="chat-starters">
            {STARTERS.map((starter) => (
              <button key={starter.label} onClick={() => onStart(starter.prompt)}>
                {/* The V stays off a suggestion chip: it is the app speaking as
                    itself, not a bullet. */}
                <SparklesIcon size={13} />
                <span>{starter.label}</span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {turns.map((turn) =>
        turn.role === "tool" ? (
          <ChatAction key={turn.id} turn={turn} />
        ) : (
          <ChatMessage
            key={turn.id}
            turn={turn}
            active={active}
            speaking={speakingTurn === turn.id}
            onRetry={onRetry}
            onRun={onRun}
          />
        ),
      )}
      {notice && (
        <p className="chat-error" role="alert">
          {notice}
        </p>
      )}
    </>
  );
}
