import type { AgentEvent, ChatEventRow } from "../agentTypes";
import type { TranscriptBlock, TranscriptState } from "./agentTranscriptTypes.ts";

export type { TranscriptBlock, TranscriptState } from "./agentTranscriptTypes.ts";
import {
  addFile,
  addSkill,
  addUsage,
  appendDelta,
  fillTool,
  settleAssistant,
  settleFooter,
} from "./agentTranscriptBlocks.ts";

// Folding a stream of events into something a person can read.
//
// The transcript is not the event log rendered one row per event. A shell
// command arrives as two events at two moments — announced, then answered —
// and rendering them as two blocks puts the command at the top of the screen
// and its output somewhere below, with whatever the model said in between.
// So `tool.requested` opens a block and `tool.output` fills the one it
// belongs to, matched by call id.
//
// Three properties this has to hold, because all three actually happen:
//
// * **Deltas are provisional.** They stream to make typing feel live and are
//   replaced wholesale by the `assistant.completed` that follows. A reload
//   must look identical to what was on screen, and it does because the
//   completion is the only thing stored.
// * **Duplicates are ignored.** A row already folded in by `seq` is dropped,
//   so a reconnect that replays the tail costs nothing.
// * **Order is by `seq`, not arrival.** Two events written in the same
//   millisecond still have an order, and a late delivery must not jump it.

export function emptyTranscript(): TranscriptState {
  return {
    blocks: [],
    seen: new Set(),
    usage: { inputTokens: 0, outputTokens: 0, costUsd: null },
    turns: {},
  };
}

/** Folds one row in, returning a new state (or the same one if it changed nothing). */
export function reduce(state: TranscriptState, row: ChatEventRow): TranscriptState {
  if (row.seq >= 0 && state.seen.has(row.seq)) return state;
  const turns = trackTurn(state.turns, row);
  const blocks = applyEvent(state.blocks, row, turns);
  const usage = row.kind === "usage.updated" ? addUsage(state.usage, row) : state.usage;
  if (blocks === state.blocks && usage === state.usage && turns === state.turns) return state;
  const seen = row.seq >= 0 ? new Set(state.seen).add(row.seq) : state.seen;
  return { blocks, seen, usage, turns };
}

/** Remembers when a turn began and what it was asked, for its footer. */
function trackTurn(
  turns: TranscriptState["turns"],
  row: ChatEventRow,
): TranscriptState["turns"] {
  if (row.kind !== "turn.started") return turns;
  return { ...turns, [row.turnId]: { startedMs: row.createdMs, prompt: row.prompt } };
}

/** Folds a whole page in one pass — what opening a chat does. */
export function reduceAll(rows: readonly ChatEventRow[]): TranscriptState {
  return rows.reduce(reduce, emptyTranscript());
}

function applyEvent(
  blocks: TranscriptBlock[],
  row: ChatEventRow,
  turns: TranscriptState["turns"],
): TranscriptBlock[] {
  const event: AgentEvent = row;
  switch (event.kind) {
    case "turn.started":
      return [
        ...blocks,
        {
          id: `${row.turnId}-prompt`,
          type: "prompt",
          seq: row.seq,
          text: event.prompt,
          occasion: event.occasion ?? null,
        },
      ];

    case "assistant.delta":
      return appendDelta(blocks, row.turnId, event.text);

    case "assistant.completed":
      // Replaces the streaming block for this turn rather than adding a
      // second one saying the same thing.
      return settleAssistant(blocks, row, event.text);

    case "reasoning.summary":
      return [...blocks, { id: `${row.seq}-think`, type: "reasoning", seq: row.seq, text: event.text }];

    case "tool.requested":
      return [
        ...blocks,
        {
          id: `tool-${event.callId}`,
          type: "tool",
          seq: row.seq,
          tool: event.tool,
          summary: event.summary,
          output: null,
          exitCode: null,
          failed: false,
          running: true,
          startedMs: row.createdMs,
          endedMs: null,
        },
      ];

    case "tool.output":
      return fillTool(blocks, row, event);

    case "file.changed":
      return addFile(blocks, row, event.path, event.change);

    // Collapsed into one block per turn: three skills that matched are one
    // line naming three, not three lines.
    case "skill.applied":
      return addSkill(blocks, row, event);

    case "turn.failed":
      return [
        ...blocks,
        { id: `${row.seq}-fail`, type: "notice", seq: row.seq, tone: "error", text: event.message },
      ];

    // The footer hangs off usage rather than off `turn.completed`, because
    // only Claude emits one: Codex's `turn.completed` line carries the usage
    // and nothing else, and a successful Codex turn records no closing event
    // at all. Both engines report usage exactly once per turn, so this is the
    // one row that marks a turn's end on either of them.
    case "usage.updated":
      return settleFooter(blocks, row, event, turns[row.turnId]);

    // Rendered as nothing: they move state the header shows, not the
    // transcript. Listed rather than defaulted so a new event type is a
    // compile error here instead of silently disappearing.
    case "turn.completed":
    case "session.identified":
    case "approval.requested":
    case "approval.resolved":
      return blocks;
  }
}
