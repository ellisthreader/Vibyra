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

export type ProjectVisibility = "visible" | "hidden";

export interface ProjectVisibilityPane {
  id: number;
  projectId: string;
  status: "running" | "exited" | "suspended";
  visibility: ProjectVisibility | "hibernated";
}

/** Return only native visibility updates that succeeded. Failed updates stay retryable. */
export async function syncProjectVisibility(
  panes: readonly ProjectVisibilityPane[],
  activeId: string | null,
  update: (id: number, visibility: ProjectVisibility) => Promise<void>,
): Promise<Map<number, ProjectVisibility>> {
  const pending = panes.flatMap((pane) => {
    if (pane.status !== "running" || pane.visibility === "hibernated") return [];
    const target: ProjectVisibility = pane.projectId === activeId ? "visible" : "hidden";
    // Reassert every transition at the native boundary. An earlier caller may
    // have optimistically changed JS state before its IPC failed.
    return [{ id: pane.id, target }];
  });
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
