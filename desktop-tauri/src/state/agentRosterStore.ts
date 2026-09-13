import { agentAccount, agentWrite } from "./agentWrite";
import { useAgentModeStore } from "./agentModeStore";
import { create } from "zustand";

import type { AgentPlace, AgentProfile, Engine, EngineCapabilities } from "../agentTypes";
import * as ipc from "../ipc/agentRoster";

// The native capability probe has a short cache and supports an explicit recheck.

interface RosterStore {
  agents: AgentProfile[];
  archived: AgentProfile[];
  places: Record<string, AgentPlace[]>;
  capabilities: EngineCapabilities[];
  loading: boolean;
  capabilityError: string | null;
  error: string | null;
  load: () => Promise<void>;
  recheck: () => Promise<void>;
  create: (name: string, brief: string, engine: Engine) => Promise<AgentProfile | null>;
  update: (id: string, change: ipc.AgentChange) => Promise<void>;
  archive: (id: string, archived: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  loadPlaces: (agentId: string) => Promise<void>;
  grant: (agentId: string, path: string, access: AgentPlace["access"]) => Promise<void>;
  revoke: (agentId: string, placeId: string) => Promise<void>;
  clear: () => void;
}

/** The capability record for an engine, or a pessimistic stand-in. */
export function capabilityFor(
  capabilities: readonly EngineCapabilities[],
  engine: Engine,
): EngineCapabilities {
  return (
    capabilities.find((entry) => entry.engine === engine) ?? {
      engine,
      installed: false,
      version: "",
      structured: false,
      supportsModel: false,
      supportsEffort: false,
      supportsImages: false,
      blocker: "Vibyra has not been able to check this CLI yet.",
    }
  );
}

export const useAgentRosterStore = create<RosterStore>((set, get) => {
  let revision = 0;
  const refresh = async (): Promise<void> => {
    const version = revision; const account = agentAccount();
    const [agents, archived] = await Promise.all([ipc.listAgents(), ipc.listAgents(true)]);
    if (revision === version && agentAccount() === account) set({ agents, archived });
  };

  return {
    agents: [],
    archived: [],
    places: {},
    capabilities: [],
    loading: false,
    capabilityError: null,
    error: null,

    load: async () => {
      const version = revision; const account = agentAccount();
      set({ loading: true, error: null });
      try {
        const [agents, archived, capabilities] = await Promise.all([
          ipc.listAgents(), ipc.listAgents(true),
          // A cold probe is slow enough to be worth not blocking the roster on
          // it, but the roster is useless without knowing which engines work,
          // so both are awaited and the failure of either is one message.
          get().capabilities.length > 0 && !get().capabilityError
            ? Promise.resolve(get().capabilities)
            : ipc.engineCapabilities().catch(error => { if (agentAccount() === account) set({ capabilityError: String(error) }); throw error; }),
        ]);
        if (agentAccount() !== account) return;
        set(revision === version ? { agents, archived, capabilities, loading: false, capabilityError: null } : { capabilities, loading: false, capabilityError: null });
      } catch (error) {
        if (agentAccount() === account) set({ loading: false, error: String(error) });
      }
    },

    recheck: async () => {
      set({ loading: true });
      try { set({ capabilities: await ipc.engineCapabilities(true), capabilityError: null }); }
      catch (error) { set({ capabilityError: String(error) }); }
      finally { set({ loading: false }); }
    },

    create: (name, brief, engine) => agentWrite(
      "agent.create", { name, brief, engine },
      token => ipc.createAgent({ name, brief, engine }, token),
      profile => {
        revision++;
        set(state => ({ agents: [profile, ...state.agents.filter(item => item.id !== profile.id)], error: null }));
        void get().loadPlaces(profile.id);
      },
      error => set({ error }),
    ),

    update: async (id, change) => {
      try {
        const updated = await ipc.updateAgent(id, change);
        set((state) => ({
          agents: state.agents.map((agent) => (agent.id === id ? updated : agent)),
          error: null,
        }));
      } catch (error) {
        set({ error: String(error) });
      }
    },

    archive: async (id, archived) => {
      try {
        await ipc.archiveAgent(id, archived);
        if (archived && useAgentModeStore.getState().agentId === id) useAgentModeStore.getState().selectAgent(null);
        await refresh();
      } catch (error) { set({ error: String(error) }); }
    },

    remove: async (id) => {
      try {
        await ipc.deleteAgent(id);
        if (useAgentModeStore.getState().agentId === id) useAgentModeStore.getState().selectAgent(null);
        set((state) => { const places = { ...state.places }; delete places[id]; return { places }; });
        await refresh();
      } catch (error) { set({ error: String(error) }); }
    },

    loadPlaces: async (agentId) => {
      const account = agentAccount();
      try {
        const places = await ipc.listPlaces(agentId);
        if (agentAccount() === account) set((state) => ({ places: { ...state.places, [agentId]: places } }));
      } catch (error) { if (agentAccount() === account) set({ error: String(error) }); }
    },

    grant: async (agentId, path, access) => {
      try {
        await ipc.grantPlace(agentId, path, access);
        set({ error: null });
      } catch (error) {
        set({ error: String(error) });
      }
      await get().loadPlaces(agentId);
    },

    revoke: async (agentId, placeId) => {
      await ipc.revokePlace(agentId, placeId).catch((error) => set({ error: String(error) }));
      await get().loadPlaces(agentId);
    },

    clear: () => { revision++; set({ agents: [], archived: [], places: {}, capabilities: [], loading: false, capabilityError: null, error: null }); },
  };
});
