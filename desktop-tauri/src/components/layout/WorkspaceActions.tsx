import { useWorkspaceStore } from '../../state/workspaceStore';
import { MoreIcon } from '../common/Icons';

/** The title-bar shortcut opens the same Chat/Files panel and keeps its tab. */
export function WorkspaceActions() {
  const open = useWorkspaceStore(s => s.companionOpen && s.projectMode === 'terminals');
  return <button type="button" className="icon-btn" aria-label="Chat and files sidebar"
    title={open ? 'Close sidebar' : 'Open sidebar'} aria-expanded={open} aria-controls="project-companion"
    onClick={() => {
      const store = useWorkspaceStore.getState();
      if (open) store.toggleCompanion();
      else { store.setProjectMode('terminals'); store.setCompanionTab(store.companionTab); }
    }}><MoreIcon size={18} /></button>;
}
