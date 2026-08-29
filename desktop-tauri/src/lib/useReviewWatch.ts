import { useEffect, useRef } from "react";

import { useNotificationStore } from "../state/notificationStore";
import { useReviewStore } from "../state/reviewStore";
import { useTerminalStore } from "../state/terminalStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { reviewablePanes } from "./reviewPolicy";
import { collisionNotice, fleetSignature, readyNotice } from "./reviewNotifications";
import { deriveFleet } from "./reviewDerive";

// What makes the Review panel live rather than stale.
//
// Deliberately edge-driven, not polled. An agent going quiet *is* the "ready"
// signal, and the activity ticker already computes that transition for the
// pane dots; a timer over six worktrees would run `git diff` continuously to
// learn nothing. The filesystem watcher's batches are the second edge, so a
// changeset that grows while you are looking at it still updates.

/** Long enough that a build writing hundreds of files costs one refresh. */
const FS_SETTLE_MS = 1200;

/** Everything `deriveFleet` needs except the project, which the caller knows. */
function slice() {
  const review = useReviewStore.getState();
  const terminal = useTerminalStore.getState();
  return {
    panes: terminal.panes,
    statuses: review.statusByPane,
    activity: terminal.activity,
    changedAt: review.changedAt,
    ranges: review.rangesByPane,
    orphans: review.orphans,
    landed: review.landed,
  };
}

/**
 * Runs for as long as a project is open, above the dock rather than inside it:
 * the tab's badge has to be right whether or not the panel is on screen.
 */
export function useReviewWatch(projectId: string | null, root: string | null): void {
  const fsVersion = useWorkspaceStore((state) => state.fsVersion);
  const announced = useRef("");

  // A fresh project starts a fresh fleet; carrying the last one's tallies
  // would badge this project with another's finished work.
  useEffect(() => {
    announced.current = "";
    if (!projectId || !root) return;
    const panes = reviewablePanes(useTerminalStore.getState().panes, projectId);
    void useReviewStore.getState().refreshAll(panes);
    void useReviewStore.getState().refreshOrphans(root);
    void useReviewStore.getState().refreshGithub(root);
  }, [projectId, root]);

  // The idle edge: refresh exactly the pane that just stopped working.
  useEffect(() => {
    if (!projectId) return;
    let previous = useTerminalStore.getState().activity;
    return useTerminalStore.subscribe((state) => {
      const next = state.activity;
      if (next === previous) return;
      const settled = reviewablePanes(state.panes, projectId).filter(
        (pane) => previous[pane.id] === "working" && next[pane.id] !== "working",
      );
      previous = next;
      for (const pane of settled) void useReviewStore.getState().refresh(pane);
    });
  }, [projectId]);

  // The filesystem edge, debounced: a running agent writes in bursts.
  useEffect(() => {
    if (!projectId || fsVersion === 0) return;
    const timer = setTimeout(() => {
      const panes = reviewablePanes(useTerminalStore.getState().panes, projectId);
      void useReviewStore.getState().refreshAll(panes);
    }, FS_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [fsVersion, projectId]);

  // Announcing is a subscription, not an effect on a value: it has to fire on
  // whichever of the two edges above lands first.
  useEffect(() => {
    if (!projectId) return;
    return useReviewStore.subscribe(() => {
      const { rows, found } = deriveFleet({ ...slice(), projectId });
      const signature = fleetSignature(rows, found);
      if (signature === announced.current) return;
      const first = announced.current === "";
      announced.current = signature;
      // The first derivation after opening a project is a description of what
      // was already there, not news, so it seeds the signature silently.
      if (first) return;
      const push = useNotificationStore.getState().push;
      for (const row of rows) {
        const notice = readyNotice(row);
        if (notice) push(notice);
      }
      for (const collision of found) {
        const notice = collisionNotice(collision);
        if (notice) push(notice);
      }
    });
  }, [projectId]);
}
