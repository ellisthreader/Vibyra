import { create } from "zustand";

import type { ApprovalRequest, MemoryEntry, Routine, RoutineRun, Skill } from "../agentTypes";
import * as ipc from "../ipc/agentConfig";

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
  error: string | null;
  loadMemory: (agentId: string) => Promise<void>;
  addMemory: (agentId: string, body: string, klass: MemoryEntry["class"]) => Promise<void>;
  setMemoryStatus: (agentId: string, id: string, status: MemoryEntry["status"]) => Promise<void>;
  amendMemory: (
    agentId: string,
    id: string,
    change: { body?: string; priority?: number; pinned?: boolean },
  ) => Promise<void>;
  deleteMemory: (agentId: string, id: string) => Promise<void>;
  loadSkills: () => Promise<void>;
  saveSkill: (draft: ipc.SkillDraft, id?: string) => Promise<boolean>;
  setSkillStatus: (id: string, status: string) => Promise<void>;
  assignSkill: (agentId: string, skillId: string, enabled: boolean) => Promise<void>;
  loadRoutines: (agentId: string | null) => Promise<void>;
  saveRoutine: (draft: ipc.RoutineDraft, id?: string) => Promise<boolean>;
  setRoutineEnabled: (id: string, enabled: boolean) => Promise<void>;
  deleteRoutine: (id: string) => Promise<void>;
  loadRuns: (routineId: string) => Promise<void>;
  loadApprovals: () => Promise<void>;
  resolveApproval: (id: string, approved: boolean, fingerprint: string) => Promise<void>;
  clear: () => void;
}

export const useAgentWorkStore = create<WorkStore>((set, get) => {
  const fail = (error: unknown) => set({ error: String(error) });

  return {
    memory: {},
    skills: [],
    routines: [],
    runs: {},
    approvals: [],
    error: null,

    loadMemory: async (agentId) => {
      const entries = await ipc.listMemory(agentId).catch(() => []);
      set((state) => ({ memory: { ...state.memory, [agentId]: entries } }));
    },

    addMemory: async (agentId, body, klass) => {
      try {
        await ipc.addMemory(agentId, { class: klass, body });
        set({ error: null });
      } catch (error) {
        // The one error here worth surfacing verbatim: the store refuses
        // anything credential-shaped, and the message says what to do instead.
        fail(error);
      }
      await get().loadMemory(agentId);
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

    loadSkills: async () => set({ skills: await ipc.listSkills().catch(() => []) }),

    saveSkill: async (draft, id) => {
      try {
        if (id) await ipc.reviseSkill(id, draft);
        else await ipc.installSkill(draft);
        set({ error: null });
        await get().loadSkills();
        return true;
      } catch (error) {
        fail(error);
        return false;
      }
    },

    setSkillStatus: async (id, status) => {
      await ipc.setSkillStatus(id, status).catch(fail);
      await get().loadSkills();
    },

    assignSkill: async (agentId, skillId, enabled) => {
      await ipc.assignSkill(agentId, skillId, enabled).catch(fail);
    },

    loadRoutines: async (agentId) =>
      set({ routines: await ipc.listRoutines(agentId).catch(() => []) }),

    saveRoutine: async (draft, id) => {
      try {
        if (id) await ipc.updateRoutine(id, draft);
        else await ipc.createRoutine(draft);
        set({ error: null });
        await get().loadRoutines(null);
        return true;
      } catch (error) {
        fail(error);
        return false;
      }
    },

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
      const runs = await ipc.routineHistory(routineId).catch(() => []);
      set((state) => ({ runs: { ...state.runs, [routineId]: runs } }));
    },

    loadApprovals: async () => set({ approvals: await ipc.listApprovals().catch(() => []) }),

    resolveApproval: async (id, approved, fingerprint) => {
      try {
        const resolved = await ipc.resolveApproval(id, approved, fingerprint);
        if (resolved.state === "invalidated") {
          set({
            error:
              "That action changed after the card was raised, so nothing was done. " +
              "Ask again if you still want it.",
          });
        }
      } catch (error) {
        fail(error);
      }
      await get().loadApprovals();
    },

    clear: () =>
      set({ memory: {}, skills: [], routines: [], runs: {}, approvals: [], error: null }),
  };
});
