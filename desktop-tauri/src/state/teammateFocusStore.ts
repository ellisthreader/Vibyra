import { create } from "zustand";

// The bridge between notifications and the teammate workspace, whose selection
// is local React state. Notifications ask for a teammate; the workspace opens
// it and reports which thread is on screen so an alert for it is not repeated.

interface TeammateFocus {
  /** A teammate a notification asked to open; nonce re-fires the same id. */
  requested: { id: string; nonce: number; runId?: string } | null;
  /** Teammate whose thread is visible in Agent mode, or null. */
  visible: string | null;
  /** What the Agents page shows, for the title bar trail (a teammate, Activity, a new teammate). */
  trail: string | null;
  request(id: string, runId?: string): void;
  setVisible(id: string | null): void;
  setTrail(trail: string | null): void;
}

export const useTeammateFocus = create<TeammateFocus>((set) => ({
  requested: null,
  visible: null,
  trail: null,
  request: (id, runId) => set({ requested: { id, runId, nonce: Date.now() } }),
  setVisible: (id) => set((s) => (s.visible === id ? s : { visible: id })),
  setTrail: (trail) => set((s) => (s.trail === trail ? s : { trail })),
}));
