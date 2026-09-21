import { useWorkspaceStore } from '../../state/workspaceStore';
import { ExpandIcon } from '../common/Icons';

export function DockSizeControl() {
  const full = useWorkspaceStore(s => s.companionSize === 'full');
  const preview = useWorkspaceStore(s => s.companionTab === 'preview');
  const label = full ? 'Restore sidebar' : preview ? 'Expand Preview to full screen' : 'Expand sidebar';
  return <button className="icon-btn sidebar-expand" aria-label={label} title={label} aria-pressed={full}
    onClick={() => useWorkspaceStore.getState().setCompanionSize(full ? 'compact' : 'full')}>
    {full ? <span aria-hidden="true">↙</span> : <ExpandIcon size={15} />}
  </button>;
}
