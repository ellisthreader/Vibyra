/** Keep worktree starts inside the owning project's existing cleanup boundary. */
export class PreviewOwnership {
  private owners = new Map<string, { roots: Set<string>; pending: Set<Promise<unknown>>; stopping: Promise<void> | null }>();
  private owner(project: string) {
    let owner = this.owners.get(project);
    if (!owner) { owner = { roots: new Set([project]), pending: new Set(), stopping: null }; this.owners.set(project, owner); }
    return owner;
  }
  async start<T>(project: string, root: string, start: () => Promise<T>): Promise<T> {
    const owner = this.owner(project);
    if (owner.stopping) throw new Error('This project’s previews are stopping. Try again after switching projects.');
    owner.roots.add(root);
    const pending = start(); owner.pending.add(pending);
    try { return await pending; } finally { owner.pending.delete(pending); }
  }
  stop(project: string, stop: (root: string) => Promise<void>): Promise<void> {
    const owner = this.owner(project);
    if (owner.stopping) return owner.stopping;
    const pending = [...owner.pending];
    owner.stopping = Promise.resolve().then(async () => {
      await Promise.allSettled(pending);
      const results = await Promise.allSettled([...owner.roots].map(stop));
      const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failure) throw failure.reason;
      this.owners.delete(project);
    }).finally(() => { owner.stopping = null; });
    return owner.stopping;
  }
}
