import { useWorkspaceStore } from '../../state/workspaceStore';

export function WorkspaceActions() {
  const open = useWorkspaceStore(s => s.companionOpen);
  return <button id="workspace-sidebar-toggle" type="button" className="icon-btn" aria-label="Workspace sidebar"
    title={open ? 'Close sidebar' : 'Open sidebar'} aria-expanded={open} aria-controls="project-companion"
    onClick={() => useWorkspaceStore.getState().toggleCompanion()}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" /><path d="M15 4v16" />
    </svg>
  </button>;
}
