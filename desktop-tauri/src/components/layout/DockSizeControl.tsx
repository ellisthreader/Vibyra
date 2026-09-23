import { useWorkspaceStore } from '../../state/workspaceStore';
import { ExpandIcon } from '../common/Icons';

export function DockSizeControl() {
  const full = useWorkspaceStore(s => s.companionSize === 'full');
  const preview = useWorkspaceStore(s => s.companionTab === 'preview');
  const label = full ? 'Restore sidebar' : preview ? 'Expand Preview to full screen' : 'Expand sidebar';
  return <button className="icon-btn sidebar-expand" aria-label={label} title={label} aria-pressed={full}
    onClick={() => useWorkspaceStore.getState().setCompanionSize(full ? 'compact' : 'full')}>
    {full ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 10h6V4M20 14h-6v6M10 10 3 3m11 11 7 7" /></svg> : <ExpandIcon size={15} />}
  </button>;
}
