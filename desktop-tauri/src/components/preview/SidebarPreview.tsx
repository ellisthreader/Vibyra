import { useFilesRoot } from '../companion/useFilesRoot';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { useProjectStore } from '../../state/projectStore';
import { PreviewWorkspace } from './PreviewWorkspace';
import type { PreviewScope } from '../worktrees/types';
import { useAccountStore } from '../../state/accountStore';
import { allows } from '../../lib/planLimits';
import { ProLockPanel } from '../plan/ProLockPanel';

export function SidebarPreview({ scope, onReset, active }: { scope: PreviewScope | null; onReset(): void; active: boolean }) {
  const focused = useFilesRoot(active && !scope);
  const projectRoot = useWorkspaceStore(s => s.root);
  const projectId = useProjectStore(s => s.activeId);
  const root = scope?.root ?? focused.root;
  const error = scope ? '' : focused.error;
  // Preview is Pro: on Free nothing starts, and the panel says what it would do.
  const included = useAccountStore(s => allows(s.snapshot.profile, 'preview'));
  if (!included) return <ProLockPanel title="Preview is part of Vibyra Pro"
    body="Run your site beside your agents and watch it change as they build, on any screen size." />;
  return <>
    {error ? <p className="worktree-error" role="alert">{error}</p> : root && projectId
      ? <PreviewWorkspace key={`${projectId}:${root}`} projectId={JSON.stringify([projectId, root])} shareProjectId={projectId} root={root} onResetScope={scope ? onReset : undefined} projectRoot={projectRoot ?? root} active={active} />
      : <p className="worktree-empty">Finding the working folder…</p>}
  </>;
}
