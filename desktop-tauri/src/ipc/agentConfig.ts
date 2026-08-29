import { invoke } from "@tauri-apps/api/core";

import type {
  ApprovalRequest,
  MemoryClass,
  MemoryEntry,
  MemoryStatus,
  PermissionMode,
  Routine,
  RoutineRun,
  Schedule,
  Skill,
} from "../agentTypes";

// Memory, skills, routines and decisions. Every rule these touch lives in the
// core crate; this file only names the commands.

export function listMemory(agentId: string): Promise<MemoryEntry[]> {
  return invoke("agent_memory_list", { agentId });
}

export function addMemory(
  agentId: string,
  entry: { class: MemoryClass; body: string; priority?: number },
): Promise<MemoryEntry> {
  return invoke("agent_memory_add", {
    agentId,
    entry: { class: entry.class, body: entry.body, priority: entry.priority ?? null },
  });
}

export function setMemoryStatus(id: string, status: MemoryStatus): Promise<void> {
  return invoke("agent_memory_set_status", { id, status });
}

export function amendMemory(
  id: string,
  change: { body?: string; priority?: number; pinned?: boolean },
): Promise<void> {
  return invoke("agent_memory_amend", {
    id,
    body: change.body ?? null,
    priority: change.priority ?? null,
    pinned: change.pinned ?? null,
  });
}

export function deleteMemory(id: string): Promise<void> {
  return invoke("agent_memory_delete", { id });
}

export interface SkillDraft {
  name: string;
  summary: string;
  trigger: string;
  procedure: string;
  verification: string;
  boundary: string;
}

export function listSkills(): Promise<Skill[]> {
  return invoke("skill_list");
}

export function installSkill(draft: SkillDraft): Promise<Skill> {
  return invoke("skill_install", { draft });
}

export function reviseSkill(id: string, draft: SkillDraft): Promise<Skill> {
  return invoke("skill_revise", { id, draft });
}

export function setSkillStatus(id: string, status: string): Promise<void> {
  return invoke("skill_set_status", { id, status });
}

export function assignSkill(agentId: string, skillId: string, enabled: boolean): Promise<void> {
  return invoke("skill_assign", { agentId, skillId, enabled });
}

export function assignedSkills(agentId: string): Promise<Skill[]> {
  return invoke("skill_assigned", { agentId });
}

export function skillHistory(skillId: string): Promise<Skill[]> {
  return invoke("skill_history", { skillId });
}

export function rollBackSkill(skillId: string, version: number): Promise<Skill> {
  return invoke("skill_roll_back", { skillId, version });
}

export interface RoutineDraft {
  agentId: string;
  name: string;
  instruction: string;
  schedule: Schedule;
  timezone: string;
  permission?: PermissionMode;
}

export function listRoutines(agentId: string | null): Promise<Routine[]> {
  return invoke("routine_list", { agentId });
}

export function createRoutine(draft: RoutineDraft): Promise<Routine> {
  return invoke("routine_create", { draft });
}

export function updateRoutine(id: string, draft: RoutineDraft): Promise<Routine> {
  return invoke("routine_update", { id, draft });
}

export function setRoutineEnabled(id: string, enabled: boolean): Promise<Routine> {
  return invoke("routine_set_enabled", { id, enabled });
}

export function deleteRoutine(id: string): Promise<void> {
  return invoke("routine_delete", { id });
}

export function routineHistory(routineId: string): Promise<RoutineRun[]> {
  return invoke("routine_history", { routineId });
}

export function routineZones(): Promise<string[]> {
  return invoke("routine_zones");
}

export function listApprovals(): Promise<ApprovalRequest[]> {
  return invoke("approval_list");
}

/**
 * Answers a decision. The fingerprint is what the card showed: if the action
 * moved underneath it, nothing is authorised and the card reads invalidated.
 */
export function resolveApproval(
  id: string,
  approved: boolean,
  fingerprint: string,
): Promise<ApprovalRequest> {
  return invoke("approval_resolve", { id, approved, fingerprint });
}
