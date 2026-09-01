import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

import { useAgentWorkStore } from "../state/agentWorkStore";
import { notifyDecisionsWaiting, notifyRoutineFailed } from "./agentWorkNotices.ts";

// One subscription for the whole app.
//
// Mounted by the workspace, not by a panel: a card raised while you are
// reading Skills still has to move the badge, and the panel that fetches it is
// not on screen. Mounted *above* Agent Mode rather than inside it for the same
// reason one step further out — Code Mode is where people live, Agent Mode is
// unmounted while they are there, and a bus that dies with it could never
// raise the toast that fetches them back.
//
// The scheduler has been emitting `routine-status` three times a tick since
// Agent Mode shipped and nothing in the app has ever listened. This is the
// listener.

/** Slow enough to be a net under a dropped event, not the way work arrives. */
const FALLBACK_POLL_MS = 30_000;

export function useAgentWorkBus(): void {
  const loadApprovals = useAgentWorkStore((state) => state.loadApprovals);
  const loadRoutines = useAgentWorkStore((state) => state.loadRoutines);
  const loadRuns = useAgentWorkStore((state) => state.loadRuns);
  const setLastChecked = useAgentWorkStore((state) => state.setLastChecked);

  useEffect(() => {
    let live = true;

    const refreshApprovals = async () => {
      await loadApprovals();
      if (live) notifyDecisionsWaiting(useAgentWorkStore.getState().approvals);
    };

    void refreshApprovals();
    void loadRoutines(null);

    // The routine's own id comes back as the payload, so only the row that
    // moved refetches its history. A tick with forty routines and one due must
    // not reload forty histories — the scheduler's thread is never allowed to
    // be the reason the UI stutters over live terminals.
    const off = listen<string>("routine-status", ({ payload }) => {
      void loadRoutines(null);
      if (!payload) return;
      void loadRuns(payload).then(() => {
        if (!live) return;
        const { runs, routines } = useAgentWorkStore.getState();
        notifyRoutineFailed(payload, runs[payload] ?? [], routines);
      });
    });

    const offCard = listen("approval-raised", () => void refreshApprovals());
    // The scheduler's heartbeat, emitted whether or not anything was due. It
    // is what lets an empty Routines panel say the clock is still running,
    // which is the answer to "is this thing on?".
    const offTick = listen<number>("routine-tick", ({ payload }) => {
      setLastChecked(typeof payload === "number" ? payload : Date.now());
    });
    const timer = window.setInterval(() => void refreshApprovals(), FALLBACK_POLL_MS);

    return () => {
      live = false;
      void off.then((stop) => stop());
      void offCard.then((stop) => stop());
      void offTick.then((stop) => stop());
      window.clearInterval(timer);
    };
  }, [loadApprovals, loadRoutines, loadRuns, setLastChecked]);
}
