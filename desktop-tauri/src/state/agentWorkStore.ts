import { agentAccount } from "./agentWrite";
import { agentWorkWrites } from "./agentWorkWrites";
import { create } from "zustand";

import type { ApprovalRequest, MemoryEntry, Routine, RoutineRun, Skill } from "../agentTypes";
import * as ipc from "../ipc/agentConfig";
import { approvalActions } from "./agentApprovalActions.ts";

// Memory, skills, routines and pending decisions — the four lists the
// dashboard and the settings panes read.
//
// Decisions are polled rather than pushed, and deliberately so. A card is
// raised by a turn that may be running unattended on the scheduler's thread,
// so there is no channel the UI is holding at the time; a ten-second poll of a
// query that hits an index is cheaper than the plumbing to push, and a
// decision that appears ten seconds late is still a decision that waits.

interface WorkStore {
  memory: Record<string, MemoryEntry[]>;
  skills: Skill[];
  routines: Routine[];
  runs: Record<string, RoutineRun[]>;
  approvals: ApprovalRequest[];
  /** The chats those cards were raised in, kept beside the queue rather than
   *  derived in a selector: a selector that builds a fresh array re-renders on
   *  every store change, because zustand compares results with Object.is. */
  approvalChatIds: string[];
  error: string | null;
  loadMemory: (agentId: string) => Promise<void>;
  addMemory: (agentId: string, body: string, klass: MemoryEntry["class"]) => Promise<MemoryEntry>;
  setMemoryStatus: (agentId: string, id: string, status: MemoryEntry["status"]) => Promise<void>;
  amendMemory: (
    agentId: string,
    id: string,
    change: { body?: string; priority?: number; pinned?: boolean },
  ) => Promise<void>;
  deleteMemory: (agentId: string, id: string) => Promise<void>;
  loadSkills: () => Promise<void>;
  saveSkill: (draft: ipc.SkillDraft, id?: string) => Promise<Skill>;
  setSkillStatus: (id: string, status: string) => Promise<void>;
  assignSkill: (agentId: string, skillId: string, enabled: boolean) => Promise<void>;
  loadRoutines: (agentId: string | null) => Promise<void>;
  saveRoutine: (draft: ipc.RoutineDraft, id?: string) => Promise<Routine>;
  setRoutineEnabled: (id: string, enabled: boolean) => Promise<void>;
  deleteRoutine: (id: string) => Promise<void>;
  loadRuns: (routineId: string) => Promise<void>;
  runNow: (id: string) => Promise<void>;
  /** When the scheduler last looked. Set by the work bus from its heartbeat,
   *  so an empty Routines panel can still say the clock is running. */
  lastCheckedMs: number | null;
  setLastChecked: (at: number) => void;
  loadApprovals: () => Promise<void>;
  resolveApproval: (id: string, approved: boolean, fingerprint: string) => Promise<void>;
  clear: () => void;
}

export const useAgentWorkStore = create<WorkStore>((set, get) => {
  let revision = 0;
  const fresh = () => { const version = revision; const account = agentAccount(); return () => version === revision && agentAccount() === account; };
  const fail = (error: unknown) => set({ error: String(error) });

  return {
    memory: {},
    skills: [],
    routines: [],
    runs: {},
    approvals: [],
    approvalChatIds: [],
    lastCheckedMs: null,
    error: null,

    loadMemory: async (agentId) => {
      const current = fresh();
      try { const entries = await ipc.listMemory(agentId);
        if (current()) set((state) => ({ memory: { ...state.memory, [agentId]: entries } }));
      } catch (error) { if (current()) fail(error); }
    },

    setMemoryStatus: async (agentId, id, status) => {
      await ipc.setMemoryStatus(id, status).catch(fail);
      await get().loadMemory(agentId);
    },

    amendMemory: async (agentId, id, change) => {
      await ipc.amendMemory(id, change).catch(fail);
      await get().loadMemory(agentId);
    },

    deleteMemory: async (agentId, id) => {
      await ipc.deleteMemory(id).catch(fail);
      await get().loadMemory(agentId);
    },

    loadSkills: async () => { const current = fresh(); try { const skills = await ipc.listSkills(); if (current()) set({ skills }); } catch (error) { if (current()) fail(error); } },

    setSkillStatus: async (id, status) => {
      await ipc.setSkillStatus(id, status).catch(fail);
      await get().loadSkills();
    },

    loadRoutines: async (agentId) => { const current = fresh(); try { const routines = await ipc.listRoutines(agentId); if (current()) set({ routines }); } catch (error) { if (current()) fail(error); } },

    setRoutineEnabled: async (id, enabled) => {
      try {
        const updated = await ipc.setRoutineEnabled(id, enabled);
        set((state) => ({
          routines: state.routines.map((routine) => (routine.id === id ? updated : routine)),
        }));
      } catch (error) {
        fail(error);
      }
    },

    deleteRoutine: async (id) => {
      await ipc.deleteRoutine(id).catch(fail);
      await get().loadRoutines(null);
    },

    loadRuns: async (routineId) => {
      try { const runs = await ipc.routineHistory(routineId);
        set((state) => ({ runs: { ...state.runs, [routineId]: runs } }));
      } catch (error) { fail(error); }
    },

    runNow: async (id) => {
      try {
        await ipc.runRoutineNow(id);
        set({ error: null });
      } catch (error) {
        // Worth surfacing: the two refusals are "it is paused" and "it is
        // gone", and both tell the user what to do next.
        set({ error: String(error) });
      }
    },

    setLastChecked: (lastCheckedMs) => set({ lastCheckedMs }),

    ...approvalActions(set, get),
    ...agentWorkWrites(set, () => { revision++; }),

    clear: () => { revision++;
      set({ memory: {}, skills: [], routines: [], runs: {}, approvals: [], error: null }); },
  };
});
