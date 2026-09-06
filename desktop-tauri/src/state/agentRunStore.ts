import { create } from "zustand";
import type { AgentRun } from "../agentRunTypes";
import { listRuns } from "../ipc/agentRuns";

interface RunStore {
  runs: AgentRun[];
  error: string | null;
  refresh: () => Promise<void>;
  clear: () => void;
}
let epoch = 0;
export const useAgentRunStore = create<RunStore>((set) => ({
  runs: [], error: null,
  refresh: async () => {
    const current = epoch;
    try {
      const runs = await listRuns();
      if (current === epoch) set({ runs, error: null });
    } catch (error) {
      if (current === epoch) set({ error: String(error) });
    }
  },
  clear: () => { epoch += 1; set({ runs: [], error: null }); },
}));
