// The shapes behind memory, skills, routines, decisions and handoffs.
//
// Split from `agentTypes`, which carries the agent, chat and event shapes.
// These are the ones a settings pane or a panel reads; those are the ones the
// transcript reads, and they change for different reasons.

import type { Engine, PermissionMode } from "./agentTypes";

export type MemoryClass = "preference" | "fact" | "decision" | "constraint" | "lesson";
export type MemoryStatus = "proposed" | "active" | "archived" | "rejected";

export interface MemoryEntry {
  id: string;
  agentId: string;
  class: MemoryClass;
  body: string;
  priority: number;
  pinned: boolean;
  status: MemoryStatus;
  sourceChat: string | null;
  sourceTurn: string | null;
  createdMs: number;
  updatedMs: number;
}

export interface Skill {
  id: string;
  account: string;
  name: string;
  summary: string;
  version: number;
  trigger: string;
  procedure: string;
  verification: string;
  boundary: string;
  origin: "starter" | "user" | "agent";
  status: "installed" | "proposed" | "retired";
  createdMs: number;
  updatedMs: number;
}

export type Schedule =
  | { kind: "daily"; minuteOfDay: number }
  | { kind: "weekdays"; days: number[]; minuteOfDay: number }
  | { kind: "every"; minutes: number };

export interface Routine {
  id: string;
  agentId: string;
  name: string;
  instruction: string;
  schedule: Schedule;
  timezone: string;
  permission: PermissionMode;
  enabled: boolean;
  nextRunMs: number | null;
  /** Resolved natively so the sentence and the rule cannot drift apart. */
  description: string;
  createdMs: number;
  updatedMs: number;
}

export interface RoutineRun {
  id: string;
  routineId: string;
  chatId: string | null;
  scheduledMs: number;
  startedMs: number | null;
  endedMs: number | null;
  status: "running" | "completed" | "failed" | "skipped";
  error: string | null;
}

export type Risk = "read" | "write" | "destructive" | "spend" | "publish" | "secret";

export interface ApprovalRequest {
  id: string;
  agentId: string | null;
  agentName: string;
  chatId: string | null;
  turnId: string | null;
  risk: Risk;
  action: string;
  target: string;
  detail: string;
  costUsd: number | null;
  fingerprint: string;
  state: string;
  /** Whether "don't ask again" may be offered. Never true for outward effects. */
  trustable: boolean;
  createdMs: number;
  resolvedMs: number | null;
}

export interface MailMessage {
  id: string;
  chainId: string;
  parentId: string | null;
  senderId: string | null;
  senderName: string;
  recipientId: string | null;
  chatId: string | null;
  body: string;
  status: "delivered" | "refused" | "awaitingApproval";
  hop: number;
  createdMs: number;
}

export interface EngineCapabilities {
  engine: Engine;
  installed: boolean;
  version: string;
  structured: boolean;
  supportsModel: boolean;
  supportsEffort: boolean;
  supportsImages: boolean;
  /** Empty when `structured`; otherwise what to tell the user to do. */
  blocker: string;
}

export interface ChatAttachment {
  id: string;
  chatId: string;
  original: string;
  managedPath: string;
  mime: string;
  bytes: number;
}
