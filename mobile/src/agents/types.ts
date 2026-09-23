import type { VibesChat } from '../vibes/types';

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
}

export interface AgentSkill {
  id: string;
  revision: number;
  name: string;
  instructions: string;
  teammateIds: string[];
}
