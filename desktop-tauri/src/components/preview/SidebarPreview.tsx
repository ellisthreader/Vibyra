import { useFilesRoot } from '../companion/useFilesRoot';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { useProjectStore } from '../../state/projectStore';
import { PreviewWorkspace } from './PreviewWorkspace';
import type { PreviewScope } from '../worktrees/types';

export function SidebarPreview({ scope, onReset, active }: { scope: PreviewScope | null; onReset(): void; active: boolean }) {
  const focused = useFilesRoot(active && !scope);
  const projectRoot = useWorkspaceStore(s => s.root);
  const projectId = useProjectStore(s => s.activeId);
  const root = scope?.root ?? focused.root;
  const error = scope ? '' : focused.error;
  return <>
    {error ? <p className="worktree-error" role="alert">{error}</p> : root && projectId
      ? <PreviewWorkspace key={`${projectId}:${root}`} projectId={JSON.stringify([projectId, root])} shareProjectId={projectId} root={root} onResetScope={scope ? onReset : undefined} projectRoot={projectRoot ?? root} active={active} />
      : <p className="worktree-empty">Finding the working folder…</p>}
  </>;
}
