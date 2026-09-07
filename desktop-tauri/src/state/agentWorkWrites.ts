import type { MemoryEntry, Routine, Skill } from "../agentTypes";
import * as ipc from "../ipc/agentConfig";
import { agentWrite } from "./agentWrite";

type Lists = { skills: Skill[]; routines: Routine[]; memory: Record<string, MemoryEntry[]>; error: string | null };
type SetLists = (update: Partial<Lists> | ((state: Lists) => Partial<Lists>)) => void;
export function agentWorkWrites(set: SetLists, changed: () => void) {
  const fail = (error: string) => set({ error });
  return {
    saveSkill: (draft: ipc.SkillDraft, id?: string) => agentWrite(
      `skill.${id ?? "new"}`, draft,
      token => id ? ipc.reviseSkill(id, draft, token) : ipc.installSkill(draft, token),
      skill => { changed(); set(state => ({ skills: [skill, ...state.skills.filter(item => item.id !== skill.id)], error: null })); },
      fail,
    ),
    saveRoutine: (draft: ipc.RoutineDraft, id?: string) => agentWrite(
      `routine.${id ?? "new"}`, draft,
      token => id ? ipc.updateRoutine(id, draft, token) : ipc.createRoutine(draft, token),
      routine => { changed(); set(state => ({ routines: [routine, ...state.routines.filter(item => item.id !== routine.id)], error: null })); },
      fail,
    ),
    addMemory: (agentId: string, body: string, klass: MemoryEntry["class"]) => agentWrite(
      `memory.${agentId}`, { agentId, body, klass },
      token => ipc.addMemory(agentId, { class: klass, body }, token),
      entry => { changed(); set(state => ({ memory: { ...state.memory,
        [agentId]: [entry, ...(state.memory[agentId] ?? []).filter(item => item.id !== entry.id)] }, error: null })); },
      fail,
    ),
    assignSkill: (agentId: string, skillId: string, enabled: boolean) => ipc.assignSkill(agentId, skillId, enabled),
  };
}
