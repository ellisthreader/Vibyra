import type { AgentEvent, ChatEventRow } from "../agentTypes";
import type { TranscriptBlock, TranscriptState } from "./agentEventReducer";

// The block-level edits the reducer makes.
//
// Split out because they are all the same *kind* of operation — find the block
// this event belongs to and change it in place — while the reducer next door
// is the routing. Each one returns a new array, or the same one when nothing
// changed, so React can skip a render it does not need.

export function appendDelta(blocks: TranscriptBlock[], turnId: string, text: string): TranscriptBlock[] {
  const id = `${turnId}-say`;
  const index = blocks.findIndex((block) => block.id === id);
  if (index === -1) {
    return [...blocks, { id, type: "assistant", seq: Number.MAX_SAFE_INTEGER, text, streaming: true }];
  }
  const existing = blocks[index];
  if (existing.type !== "assistant") return blocks;
  const next = [...blocks];
  next[index] = { ...existing, text: existing.text + text };
  return next;
}

export function settleAssistant(
  blocks: TranscriptBlock[],
  row: ChatEventRow,
  text: string,
): TranscriptBlock[] {
  const streamingId = `${row.turnId}-say`;
  const index = blocks.findIndex((block) => block.id === streamingId && block.type === "assistant");
  const settled: TranscriptBlock = {
    id: `${row.seq}-say`,
    type: "assistant",
    seq: row.seq,
    text,
    streaming: false,
  };
  if (index === -1) return [...blocks, settled];
  const next = [...blocks];
  next[index] = settled;
  return next;
}

export function fillTool(
  blocks: TranscriptBlock[],
  row: ChatEventRow,
  event: Extract<AgentEvent, { kind: "tool.output" }>,
): TranscriptBlock[] {
  const index = blocks.findIndex((block) => block.id === `tool-${event.callId}`);
  if (index === -1) {
    // Output for a call we never saw announced — Claude sends tool results as
    // their own message, and a page boundary can land between the two.
    return [
      ...blocks,
      {
        id: `tool-${event.callId}`,
        type: "tool",
        seq: row.seq,
        tool: event.tool || "tool",
        summary: "",
        output: event.output,
        exitCode: event.exitCode,
        failed: event.failed,
        running: false,
      },
    ];
  }
  const existing = blocks[index];
  if (existing.type !== "tool") return blocks;
  const next = [...blocks];
  next[index] = {
    ...existing,
    tool: existing.tool || event.tool,
    output: event.output,
    exitCode: event.exitCode,
    failed: event.failed,
    running: false,
  };
  return next;
}

/** Consecutive file changes collapse into one block: eleven edits is a list. */
export function addFile(
  blocks: TranscriptBlock[],
  row: ChatEventRow,
  path: string,
  change: string,
): TranscriptBlock[] {
  const last = blocks[blocks.length - 1];
  if (last?.type === "files") {
    const next = [...blocks];
    next[next.length - 1] = { ...last, paths: [...last.paths, { path, change }] };
    return next;
  }
  return [...blocks, { id: `${row.seq}-files`, type: "files", seq: row.seq, paths: [{ path, change }] }];
}

export function addUsage(
  usage: TranscriptState["usage"],
  event: Extract<AgentEvent, { kind: "usage.updated" }>,
): TranscriptState["usage"] {
  return {
    inputTokens: usage.inputTokens + event.inputTokens,
    outputTokens: usage.outputTokens + event.outputTokens,
    costUsd:
      event.costUsd === null ? usage.costUsd : (usage.costUsd ?? 0) + event.costUsd,
  };
}
