import { create } from "zustand";

import type { AgentPlace, AgentProfile, Engine, EngineCapabilities } from "../agentTypes";
import * as ipc from "../ipc/agentRoster";

// The teammate roster, their granted folders, and what the installed CLIs can
// actually do.
//
// `capabilities` is loaded once and cached: probing two CLIs costs about a
// second, and the answer only changes when the user updates one, which they
// cannot do without leaving the app. Everything the UI offers — a model
// picker, an effort control, an attach button — is gated on it, so a control
// is never shown for a flag this build of the CLI does not have.

interface RosterStore {
  agents: AgentProfile[];
  places: Record<string, AgentPlace[]>;
  capabilities: EngineCapabilities[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
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
  const refresh = async (): Promise<void> => {
    const agents = await ipc.listAgents();
    set({ agents });
  };

  return {
    agents: [],
    places: {},
    capabilities: [],
    loading: false,
    error: null,

    load: async () => {
      set({ loading: true, error: null });
      try {
        const [agents, capabilities] = await Promise.all([
          ipc.listAgents(),
          // A cold probe is slow enough to be worth not blocking the roster on
          // it, but the roster is useless without knowing which engines work,
          // so both are awaited and the failure of either is one message.
          get().capabilities.length > 0
            ? Promise.resolve(get().capabilities)
            : ipc.engineCapabilities(),
        ]);
        set({ agents, capabilities, loading: false });
      } catch (error) {
        set({ loading: false, error: String(error) });
      }
    },

    create: async (name, brief, engine) => {
      try {
        const profile = await ipc.createAgent({ name, brief, engine });
        await refresh();
        await get().loadPlaces(profile.id);
        return profile;
      } catch (error) {
        set({ error: String(error) });
        return null;
      }
    },

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
      await ipc.archiveAgent(id, archived).catch((error) => set({ error: String(error) }));
      await refresh();
    },

    remove: async (id) => {
      await ipc.deleteAgent(id).catch((error) => set({ error: String(error) }));
      set((state) => {
        const places = { ...state.places };
        delete places[id];
        return { places };
      });
      await refresh();
    },

    loadPlaces: async (agentId) => {
      const places = await ipc.listPlaces(agentId).catch(() => []);
      set((state) => ({ places: { ...state.places, [agentId]: places } }));
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

    clear: () => set({ agents: [], places: {}, error: null }),
  };
});
