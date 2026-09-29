import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { WorkspaceModel } from '../ui/types';
import type { PreviewRunnable } from './runnable';
import { previewRunRows, previewTargetMatchesProject, previewTargetRunning } from './targetMatch';

export type LivePreviewTarget = Awaited<
  ReturnType<NonNullable<WorkspaceModel['actions']['listPreviews']>>
>['targets'][number];
export interface PreviewListing {
  target: LivePreviewTarget | null;
  /** This project's desktop apps, only from a computer that can run them. */
  runnables: PreviewRunnable[];
  /** Every listed target, for finding a run's window grant. */
  targets: LivePreviewTarget[];
}
const EMPTY: PreviewListing = { target: null, runnables: [], targets: [] };

/** A shortcut is live only while the Mac reports an approved running site for this folder.
 *  The Mac says when a site starts or stops (`preview.changed`), so it appears at once;
 *  the slow poll is for Macs from before that event. */
export function useLivePreviewTarget(
  workspace: WorkspaceModel,
  projectId?: string,
  active = true,
): LivePreviewTarget | null {
  return usePreviewListing(workspace, projectId, active).target;
}

/** The running target and runnable desktop apps for one project, scoped to host and project:
 *  a late answer for another project is never shown. */
export function usePreviewListing(workspace: WorkspaceModel, projectId?: string, active = true): PreviewListing {
  const scope = `${workspace.host?.id ?? ''}:${projectId ?? ''}`;
  const [entry, setEntry] = useState<{ scope: string; listing: PreviewListing } | null>(null);
  const listing = useRef(workspace.actions.listPreviews);
  listing.current = workspace.actions.listPreviews;
  const projects = useRef(workspace.projects);
  projects.current = workspace.projects;
  const runs = useRef(workspace.previewRunAvailable);
  runs.current = workspace.previewRunAvailable;
  const reread = useRef<(() => void) | null>(null);

  useEffect(() => {
    setEntry(null);
    if (!active || !projectId || workspace.status !== 'connected' ||
      !workspace.previewAvailable || !listing.current) return;
    let live = true;
    let pending = false;
    const read = () => {
      if (pending) return;
      pending = true;
      void listing.current!()
        .then(result => {
          const mine = (item: { projectId: string }) => previewTargetMatchesProject(item, projectId, projects.current);
          const matches = result.targets.filter(item => mine(item) && previewTargetRunning(item));
          const target = matches.find(item => item.targetId.startsWith('native-window:')) ?? matches[0] ?? null;
          const runnables = runs.current ? previewRunRows(result.runnable ?? [], projectId, projects.current) : [];
          if (live) setEntry({ scope, listing: { target, runnables, targets: result.targets } });
        })
        .catch(() => { if (live) setEntry({ scope, listing: EMPTY }); })
        .finally(() => { pending = false; });
    };
    read();
    reread.current = read;
    const timer = setInterval(read, 10000);
    // A window that opened while the phone was away shows as soon as it is back.
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') read(); });
    return () => { live = false; reread.current = null; clearInterval(timer); foreground.remove(); };
  }, [active, projectId, scope, workspace.previewAvailable, workspace.previewRunAvailable, workspace.status]);
  useEffect(() => { reread.current?.(); }, [workspace.previewRevision]);

  if (!active || !projectId || workspace.status !== 'connected' || !workspace.previewAvailable ||
    entry?.scope !== scope) return EMPTY;
  const target = entry.listing.target && previewTargetMatchesProject(entry.listing.target, projectId, workspace.projects)
    ? entry.listing.target : null;
  return { ...entry.listing, target, runnables: workspace.previewRunAvailable ? entry.listing.runnables : [] };
}
