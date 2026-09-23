import { create } from "zustand";

import { listAgents } from "../ipc/agents";
import type { ResolvedAgent } from "../types";

interface AgentStore {
  agents: ResolvedAgent[];
  loaded: boolean;
  refresh: () => Promise<void>;
  /** Replaces the list from a caller that already re-resolved it, so an
   * install can land without a second round trip. */
  setAgents: (agents: ResolvedAgent[]) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  loaded: false,

  setAgents: (agents) => set({ agents, loaded: true }),

  refresh: async () => {
    try {
      const agents = await listAgents();
      set({ agents, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));
