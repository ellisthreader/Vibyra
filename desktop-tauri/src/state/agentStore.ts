import { create } from "zustand";

import { listAgents } from "../ipc/agents";
import type { ResolvedAgent } from "../types";

interface AgentStore {
  agents: ResolvedAgent[];
  loaded: boolean;
  refresh: () => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  loaded: false,

  refresh: async () => {
    try {
      const agents = await listAgents();
      set({ agents, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));
