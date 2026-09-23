import type { ChatTurn } from "./chatTypes";

// Immutable edits to one project's thread. Every function returns the *same
// array reference* when there is nothing to do, and replaces only the turn it
// matched — which is what lets a streaming reply repaint sixty times a second
// without re-rendering the turns above it.

/** How much of the conversation is sent back with the next question. The Rust
 * clamp holds the other end of this budget; `chatBudget.test.mjs` proves they
 * still agree. */
export const MAX_CONTEXT_TURNS = 16;

function replace(turns: ChatTurn[], id: string, next: (turn: ChatTurn) => ChatTurn): ChatTurn[] {
  const index = turns.findIndex((turn) => turn.id === id);
  if (index === -1) return turns;
  const updated = next(turns[index]);
  if (updated === turns[index]) return turns;
  const copy = turns.slice();
  copy[index] = updated;
  return copy;
}

/** Appends a batch of streamed text. Inert on a turn that has already settled:
 * a delta that crosses the bridge after the outcome did must never re-open a
 * finished reply. */
export function applyDelta(turns: ChatTurn[], id: string, text: string): ChatTurn[] {
  if (!text) return turns;
  return replace(turns, id, (turn) =>
    turn.status === "streaming" ? { ...turn, content: turn.content + text } : turn,
  );
}

/** Writes the end state of a turn — or, for Stop, just the mark that says it
 * was cut short while the real settle is still on its way. */
export function settleTurn(turns: ChatTurn[], id: string, patch: Partial<ChatTurn>): ChatTurn[] {
  return replace(turns, id, (turn) => ({ ...turn, ...patch }));
}

/** Removes a turn — Retry drops the reply it is replacing, never the question. */
export function dropTurn(turns: ChatTurn[], id: string): ChatTurn[] {
  const index = turns.findIndex((turn) => turn.id === id);
  if (index === -1) return turns;
  return [...turns.slice(0, index), ...turns.slice(index + 1)];
}

/** The history that goes back to the model. Turns with no text are dropped —
 * the placeholder being streamed into, and a failure that produced nothing —
 * but a stopped partial is kept: the model wrote it, and the next question is
 * usually about it. */
export function contextFor(turns: ChatTurn[]): { role: "user" | "assistant"; content: string }[] {
  return turns
    .filter((turn) => turn.content.trim().length > 0)
    .slice(-MAX_CONTEXT_TURNS)
    .map(({ role, content, tool }) =>
      // A tool turn goes back as the person's own voice reporting what the app
      // did. The alternative is OpenAI's tool-result role, which would drag the
      // matching assistant tool_calls message back through the ledger with it.
      role === "tool"
        ? { role: "user" as const, content: `[Vibyra ran ${tool?.name ?? "a tool"}]\n${content}` }
        : { role: role as "user" | "assistant", content },
    );
}
