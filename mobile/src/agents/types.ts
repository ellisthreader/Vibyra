import type { VibesChat } from '../vibes/types';
import type { RunsApi } from './v2/runsApi';
import type { RoutinesApi } from './v2/routinesApi';
import type { ConnectionsApi } from './v2/connectionsModel';
import type { BrowserApi } from './v2/browserModel';
import type { OverviewApi } from './v2/overviewApi';

export type Avatar =
  'site' | 'review' | 'oncall' | 'assistant' | 'lead' | 'bugs' | 'db' | 'qa' | 'sprout';
export interface TeammateFields {
  model?: string;
  skillIds?: string[];
  name: string;
  brief: string;
  memory: string;
  avatar: Avatar;
  budget: number;
  integrations: string[];
}
export interface Teammate extends TeammateFields {
  id: string;
  chatId: string;
  revision: number;
  archived: boolean;
  status: string;
  unread?: boolean;
  readCursor?: string | null;
  pendingDecisionCount?: number;
  execution?: string | null;
  lastMessage: string;
  updatedAt: string;
  lastRunId: string | null;
}
export interface Roster {
  version: 1;
  enabled: boolean;
  /** False when Agents need Vibyra Pro; an older server omits it. */
  entitled?: boolean;
  teammates: Teammate[];
}
export interface AgentsApi {
  list(): Promise<Roster>;
  models?(): Promise<{ id: string; name: string; available: boolean }[]>;
  skills?(): Promise<AgentSkill[]>;
  saveSkill?(skill: AgentSkill): Promise<AgentSkill>;
  markRead?(id: string, cursor: string): Promise<void>;
  save(fields: TeammateFields, target: { id: string; revision?: number }): Promise<Teammate>;
  archive(teammate: Teammate, archived: boolean): Promise<Teammate>;
  chats(id: string): Promise<VibesChat[]>;
  decide(id: string, fingerprint: string, decision: 'allow' | 'decline'): Promise<void>;
  /** Agent v2 runs; absent on demo/sample APIs, which stay on v1. */
  runs?: RunsApi;
  /** Agent v2 routines and triggers; absent on demo/sample APIs, which keep drafts only. */
  routines?: RoutinesApi;
  /** Agent v2 connections hub, grants and remote MCP; absent on demo/sample APIs. */
  connections?: ConnectionsApi;
  /** Agent v2 browser sites per teammate (Phase 7); absent on demo/sample APIs. */
  browser?: BrowserApi;
  /** Agent v2 plan card, activity, roster summary, uploads and starter teammates (Phase 8); absent on demo/sample APIs. */
  overview?: OverviewApi;
}

export interface AgentSkill {
  id: string;
  revision: number;
  name: string;
  instructions: string;
  teammateIds: string[];
}
