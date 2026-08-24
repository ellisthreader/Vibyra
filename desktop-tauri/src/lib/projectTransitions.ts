export interface ProjectTransitionQueue {
  run<T>(transition: () => Promise<T>): Promise<T>;
}

/** Run project lifecycle changes in request order, even after one fails. */
export function createProjectTransitionQueue(): ProjectTransitionQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    run<T>(transition: () => Promise<T>): Promise<T> {
      const result = tail.then(transition, transition);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

/** Shared by project navigation and in-project mode changes. */
export const projectRuntimeTransitions = createProjectTransitionQueue();

export type ProjectVisibility = "visible" | "background" | "hidden";

export interface ProjectVisibilityPane {
  id: number;
  projectId: string;
  status: "running" | "exited" | "suspended";
  visibility: ProjectVisibility | "hibernated";
}

/**
 * Where one pane belongs natively: off this project entirely, on screen but
 * paced, or the focused pane that gets the full tick.
 *
 * Only one pane can be focused, so only one pays the 16 ms rate. That bound is
 * the whole point — the renderer cost of a delivery is per pane, so letting
 * every on-screen pane run at the tick scales straight past the frame budget.
 *
 * Returns null when the pane has no native visibility to assert.
 */
export function paneVisibilityTarget(
  pane: ProjectVisibilityPane,
  activeId: string | null,
  focusedId: number | null,
): ProjectVisibility | null {
  if (pane.status !== "running" || pane.visibility === "hibernated") return null;
  if (pane.projectId !== activeId) return "hidden";
  return pane.id === focusedId ? "visible" : "background";
}

/**
 * Where a pane belongs while a zoom is held or released.
 *
 * Releasing restores the focus-paced grid, never an all-visible one: every
 * visible pane costs the renderer its full delivery rate, and the focus
 * effect only reasserts targets when focus *changes* — which zooming the
 * already-focused pane does not.
 */
export function zoomVisibilityTarget(
  pane: ProjectVisibilityPane,
  projectId: string | null,
  zoomedId: number | null,
  focusedId: number | null,
): ProjectVisibility | null {
  if (pane.projectId !== projectId) return null;
  if (pane.status !== "running" || pane.visibility === "hibernated") return null;
  if (zoomedId !== null) return pane.id === zoomedId ? "visible" : "hidden";
  return paneVisibilityTarget(pane, projectId, focusedId);
}

interface VisibilityChange {
  id: number;
  target: ProjectVisibility;
}

/** Applies the changes, keeping only the ones the native side accepted. */
async function dispatchVisibility(
  pending: readonly VisibilityChange[],
  update: (id: number, visibility: ProjectVisibility) => Promise<void>,
): Promise<Map<number, ProjectVisibility>> {
  const results = await Promise.allSettled(
    pending.map(({ id, target }) => update(id, target)),
  );
  const applied = new Map<number, ProjectVisibility>();
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      const change = pending[index];
      applied.set(change.id, change.target);
    }
  });
  return applied;
}

/** Return only native visibility updates that succeeded. Failed updates stay retryable. */
export async function syncProjectVisibility(
  panes: readonly ProjectVisibilityPane[],
  activeId: string | null,
  update: (id: number, visibility: ProjectVisibility) => Promise<void>,
  focusedId: number | null = null,
): Promise<Map<number, ProjectVisibility>> {
  const pending = panes.flatMap((pane) => {
    const target = paneVisibilityTarget(pane, activeId, focusedId);
    // Reassert every transition at the native boundary. An earlier caller may
    // have optimistically changed JS state before its IPC failed.
    return target === null ? [] : [{ id: pane.id, target }];
  });
  return dispatchVisibility(pending, update);
}

/**
 * Hands the full tick to the newly focused pane and paces the one that lost it.
 *
 * Focus moves on every click, so unlike a project transition this sends only
 * what actually changed — at most two panes — rather than reasserting the grid
 * and spending a round trip per pane on every click.
 */
export async function syncFocusVisibility(
  panes: readonly ProjectVisibilityPane[],
  activeId: string | null,
  focusedId: number | null,
  update: (id: number, visibility: ProjectVisibility) => Promise<void>,
): Promise<Map<number, ProjectVisibility>> {
  const pending = panes.flatMap((pane) => {
    const target = paneVisibilityTarget(pane, activeId, focusedId);
    if (target === null || target === pane.visibility) return [];
    return [{ id: pane.id, target }];
  });
  return dispatchVisibility(pending, update);
}

export function applyProjectVisibility<T extends ProjectVisibilityPane>(
  panes: readonly T[],
  applied: ReadonlyMap<number, ProjectVisibility>,
): T[] {
  return panes.map((pane) => {
    const visibility = applied.get(pane.id);
    if (!visibility || pane.status !== "running" || pane.visibility === "hibernated") {
      return pane;
    }
    return pane.visibility === visibility ? pane : { ...pane, visibility };
  });
}

interface HomeTransitionActions {
  activeRoot: string | null;
  hideTerminals: () => Promise<void>;
  stopPreviews: (root: string) => Promise<void>;
  stopWatcher: () => Promise<void>;
  clearWorkspace: () => void;
  showHome: () => void;
}

/** Quiesce project-owned native work before its React workspace unmounts. */
export async function enterProjectHome(actions: HomeTransitionActions): Promise<void> {
  await actions.hideTerminals();
  if (actions.activeRoot) await actions.stopPreviews(actions.activeRoot).catch(() => {});
  await actions.stopWatcher().catch(() => {});
  actions.clearWorkspace();
  actions.showHome();
}
