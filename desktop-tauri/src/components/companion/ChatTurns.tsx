import type { ChatTurn } from "../../state/chatTypes";
import { SparklesIcon, TerminalIcon, EyeIcon } from "../common/Icons";
import { VibyraMark } from "../common/VibyraMark";

import { ChatAction } from "./ChatAction";
import { ChatMessage } from "./ChatMessage";

const STARTERS = [
  {
    label: 'Check my terminals',
    detail: 'See what is running and what needs you',
    icon: TerminalIcon,
    prompt: 'Check the terminals in this project and briefly tell me what is running and whether anything needs my attention.',
  },
  {
    label: "Explain this project",
    detail: 'Find your bearings in the codebase',
    icon: EyeIcon,
    prompt: "Give me a concise overview of this project, its main entry points, and how the pieces fit together.",
  },
  {
    label: "Choose the next useful task",
    detail: 'Turn an idea into a clear next step',
    icon: SparklesIcon,
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
          <h3>What can I help with?</h3>
          <p>Get a fresh perspective, check your agents, or take the next step.</p>
          <div className="chat-starters">
            {STARTERS.map((starter) => (
              <button key={starter.label} onClick={() => onStart(starter.prompt)}>
                {/* The V stays off a suggestion chip: it is the app speaking as
                    itself, not a bullet. */}
                <starter.icon size={17} />
                <span className="chat-starter-copy"><span>{starter.label}</span><small>{starter.detail}</small></span>
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
