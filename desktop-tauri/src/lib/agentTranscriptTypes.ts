import type { TurnOccasion } from "../agentTypes";

// The shapes a transcript is made of, split from the fold next door.
//
// A separate file because these are read by everything that renders a
// transcript — the list, every block component, the footer — while the fold
// itself is read by nothing but the store. Importing the reducer to get a type
// dragged the whole event switch into every component that only wanted to name
// a block.

/** One rendered block. */
export type TranscriptBlock =
  | {
      id: string;
      type: "prompt";
      seq: number;
      text: string;
      /** Set when a routine or a handoff caused this turn, never when a
       *  person typed it — the banner exists to explain a prompt nobody
       *  wrote, and one over every prompt would be noise. */
      occasion: TurnOccasion | null;
    }
  | { id: string; type: "assistant"; seq: number; text: string; streaming: boolean }
  | { id: string; type: "reasoning"; seq: number; text: string }
  | {
      id: string;
      type: "tool";
      seq: number;
      tool: string;
      summary: string;
      output: string | null;
      exitCode: number | null;
      failed: boolean;
      running: boolean;
      /** For the elapsed time: both rows carry `createdMs`. */
      startedMs: number;
      endedMs: number | null;
    }
  | { id: string; type: "files"; seq: number; paths: { path: string; change: string }[] }
  | {
      id: string;
      type: "skills";
      seq: number;
      applied: { skillId: string; name: string; version: number }[];
    }
  | { id: string; type: "notice"; seq: number; tone: "error" | "info"; text: string }
  | {
      id: string;
      type: "footer";
      seq: number;
      turnId: string;
      /** The prompt this turn ran, so Retry and Edit have it without a lookup. */
      prompt: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number | null;
      elapsedMs: number | null;
    };

export interface TranscriptState {
  blocks: TranscriptBlock[];
  /** Seqs already folded in, so a replayed tail is free. */
  seen: Set<number>;
  /** Tokens and cost for the chat so far, as the provider reported them. */
  usage: { inputTokens: number; outputTokens: number; costUsd: number | null };
  /** Turns that have started, so a footer knows when its turn began and what
   *  it was asked. Dropped once the footer carries both. */
  turns: Record<string, { startedMs: number; prompt: string }>;
}
