import { useAccountStore } from '../../state/accountStore';
import { useState } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { FilesPanel } from '../companion/FilesPanel';
import { GitHubConnection } from './GitHubConnection';
import { useWorktrees } from './useWorktrees';
import type { PreviewScope, TreeSession, Worktree } from './types';
import './worktrees.css';

function owners(tree: Worktree, sessions: TreeSession[]) {
  const normalized = (path: string) => path.replaceAll('\\', '/').replace(/\/$/, '');
  const root = normalized(tree.root);
  return sessions.filter(s => normalized(s.directory) === root || normalized(s.directory).startsWith(root + '/'));
}
type Props = { active: boolean; onPreview(scope: PreviewScope): void };
export function WorktreesPanel(props: Props) {
  const account = useAccountStore(s => s.snapshot.profile?.email ?? 'guest');
  return <ConnectedWorktrees key={account} {...props} />;
}
function ConnectedWorktrees({ active, onPreview }: Props) {
  const [connected, setConnected] = useState(false);
  const root = useWorkspaceStore(s => s.root);
  const project = useProjectStore(s => s.activeId);
  const data = useWorktrees(root, project, active && connected);
  const [selected, setSelected] = useState<string | null>(null);
  const trees = data.inventory?.worktrees.filter(tree => !tree.isMain) ?? [];
  const tree = trees.find(t => t.root === selected);
  const detail = () => {
    if (!tree) return null;
    const session = owners(tree, data.sessions)[0];
    const title = session?.title ?? tree.branch;
    const directory = session?.directory ?? tree.directory;
    return <div className="worktree-detail">
      <button className="worktree-back" onClick={() => setSelected(null)}>← All worktrees</button>
      <h2>{title}</h2><p className="worktree-branch" title={directory}>⑂ {tree.branch}</p>
      <div className="worktree-detail__actions"><span>{tree.upstream ? `Tracks ${tree.upstream}` : 'Local branch'}</span><button className="btn" disabled={!tree.available} onClick={() => onPreview({ root: directory, title: tree.branch })}>Preview ↗</button></div>
      {tree.available ? <FilesPanel key={directory} scope={{ root: directory, title, error: '' }} /> : <p className="worktree-error">This working folder is unavailable. Restore it before opening files or Preview.</p>}
    </div>;
  }
  return <div className="worktrees-panel">
    <GitHubConnection repository={data.inventory?.repository ?? null} onConnected={setConnected} />
    {!connected ? <p className="worktree-empty">Connect GitHub to use Safe Mode worktrees.</p> : selected && tree ? detail() : <>
    <div className="worktrees-heading"><span>{data.inventory ? `${trees.length} worktree${trees.length === 1 ? '' : 's'}` : 'Worktrees'}</span><span>Safe Mode on</span></div>
    {data.error && <p className="worktree-error" role="alert">{data.error}<button onClick={data.refresh}>Retry</button></p>}
    {!data.inventory && !data.error && <p className="worktree-empty">Loading worktrees…</p>}
    {data.inventory && !trees.length && <p className="worktree-empty">No separate worktrees yet. New sessions launched in Safe Mode appear here.</p>}
    {trees.map(tree => {
      const sessions = owners(tree, data.sessions), changes = data.changes[tree.root];
      const state = !tree.available || changes?.conflict || sessions.some(s => s.state === 'attention') ? 'attention' : sessions.some(s => s.state === 'working') ? 'working' : 'idle';
      const label = !tree.available ? 'Unavailable' : state === 'attention' ? 'Needs attention' : state === 'working' ? 'Working' : sessions.length ? 'Idle' : 'No active session';
      return <button className="worktree-row" key={tree.root} onClick={() => setSelected(tree.root)}>
        <span className="worktree-row__top"><i className={`worktree-dot worktree-dot--${state}`} /><strong>{sessions[0]?.title ?? tree.branch}</strong><small data-state={state}>{label}</small></span>
        <span className="worktree-branch">⑂ {tree.branch}</span>
        <span className="worktree-row__bottom"><span>{changes?.count != null ? `${changes.count} files changed` : 'Changes unavailable'}</span><span>{tree.upstream ? `Tracks ${tree.upstream}` : 'Local branch'}</span></span>
      </button>;
    })}
    {!!trees.length && <p className="worktree-empty">Each worktree has its own working folder and branch.</p>}
    </>}
  </div>;
}
