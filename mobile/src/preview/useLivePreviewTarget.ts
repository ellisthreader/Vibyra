import { useEffect, useRef, useState } from 'react';
import type { WorkspaceModel } from '../ui/types';
import { previewTargetMatchesProject, previewTargetRunning } from './targetMatch';

export type LivePreviewTarget = Awaited<
  ReturnType<NonNullable<WorkspaceModel['actions']['listPreviews']>>
>['targets'][number];

/** A shortcut is live only while the Mac reports an approved running site for this folder.
 *  The Mac says when a site starts or stops (`preview.changed`), so it appears at once;
 *  the slow poll is for Macs from before that event. */
export function useLivePreviewTarget(
  workspace: WorkspaceModel,
  projectId?: string,
  active = true,
): LivePreviewTarget | null {
  const scope = `${workspace.host?.id ?? ''}:${projectId ?? ''}`;
  const [entry, setEntry] = useState<{ scope: string; target: LivePreviewTarget | null } | null>(null);
  const listing = useRef(workspace.actions.listPreviews);
  listing.current = workspace.actions.listPreviews;
  const projects = useRef(workspace.projects);
  projects.current = workspace.projects;
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
          if (live) setEntry({ scope, target: result.targets.find(item =>
            previewTargetMatchesProject(item, projectId, projects.current) &&
            previewTargetRunning(item)) ?? null });
        })
        .catch(() => { if (live) setEntry({ scope, target: null }); })
        .finally(() => { pending = false; });
    };
    read();
    reread.current = read;
    const timer = setInterval(read, 10000);
    return () => { live = false; reread.current = null; clearInterval(timer); };
  }, [active, projectId, scope, workspace.previewAvailable, workspace.status]);
  useEffect(() => { reread.current?.(); }, [workspace.previewRevision]);

  return active && projectId && workspace.status === 'connected' &&
    workspace.previewAvailable && entry?.scope === scope && entry.target &&
    previewTargetMatchesProject(entry.target, projectId, workspace.projects) ? entry.target : null;
}
