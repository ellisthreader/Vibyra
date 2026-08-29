// The shapes Agent Mode's native side sends: the agent, the chat, and the
// events inside it. Memory, skills, routines, decisions and handoffs live in
// `agentWorkTypes` and are re-exported here, so every consumer has one import
// to reach for and the two files can still be read separately.
//
// Every one of these is `camelCase` because the Rust side renames on
// serialisation; nothing here does its own conversion.

export * from "./agentWorkTypes";

export type Engine = "claude" | "codex";
export type PermissionMode = "plan" | "standard" | "full";
export type PlaceAccess = "read" | "readWrite";
export type Reflection = "off" | "suggest" | "automatic";
export type ChatSource = "user" | "routine" | "handoff";

/** The three top-level places the window can be. */
export type AppMode = "agent" | "code" | "chat";

export interface AgentProfile {
  id: string;
  account: string;
  name: string;
  brief: string;
  engine: Engine;
  model: string | null;
  effort: string | null;
  permission: PermissionMode;
  memoryBudget: number;
  reflection: Reflection;
  homePath: string;
  accent: string;
  mailEnabled: boolean;
  routinesAllowed: boolean;
  createdMs: number;
  updatedMs: number;
  archivedMs: number | null;
}

export interface AgentPlace {
  id: string;
  agentId: string;
  path: string;
  access: PlaceAccess;
  label: string;
  createdMs: number;
}

export interface AgentChat {
  id: string;
  account: string;
  /** Null is Chat Mode: no teammate, and no reach unless a place is mounted. */
  agentId: string | null;
  title: string;
  engine: Engine;
  sessionId: string | null;
  state: "idle" | "running" | "failed";
  source: ChatSource;
  mountedPlace: string | null;
  pinned: boolean;
  createdMs: number;
  updatedMs: number;
  archivedMs: number | null;
}

/** One normalized event, flattened: `{ kind, …payload }`. */
export type AgentEvent =
  | { kind: "turn.started"; prompt: string }
  | { kind: "assistant.delta"; text: string }
  | { kind: "assistant.completed"; text: string }
  | { kind: "reasoning.summary"; text: string }
  | { kind: "tool.requested"; callId: string; tool: string; summary: string }
  | {
      kind: "tool.output";
      callId: string;
      tool: string;
      output: string;
      exitCode: number | null;
      failed: boolean;
    }
  | { kind: "file.changed"; path: string; change: string }
  | { kind: "approval.requested"; approvalId: string; action: string }
  | { kind: "approval.resolved"; approvalId: string; approved: boolean }
  | { kind: "usage.updated"; inputTokens: number; outputTokens: number; costUsd: number | null }
  | { kind: "session.identified"; sessionId: string }
  | { kind: "turn.completed"; result: string }
  | { kind: "turn.failed"; message: string };

export type ChatEventRow = AgentEvent & {
  chatId: string;
  turnId: string;
  /** The chat's own counter. `-1` marks a streamed delta, which is never stored. */
  seq: number;
  createdMs: number;
};
