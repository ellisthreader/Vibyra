import { useProjectStore } from '../../state/projectStore';
import { openNewProject } from '../../state/newProject';
import '../../styles/workspace-tree.css';
import { usePhoneStore } from '../../state/phoneStore';
import { keyLabel } from '../../lib/platform';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { GearIcon, PlusIcon, LinkIcon, CloseIcon } from '../common/Icons';
import { ReportProblemButton } from '../report/ReportProblemButton';
import { WorkspaceTree } from './WorkspaceTree';
export function ProjectStrip() {
  const inProject = useProjectStore(s => s.view === 'project');
  const fullscreenPreview = useWorkspaceStore(s => s.companionOpen && s.companionTab === 'preview' && s.companionSize === 'full');
  const sidebarOpen = useWorkspaceStore(s => s.projectsSidebarOpen);
  const phone = usePhoneStore(s => s.status);
  const connected = Boolean(phone?.active.length);
  const connection = !phone ? 'Checking connection' : connected ? 'Phone connected' : 'No phone connected';
  return <aside hidden={!sidebarOpen || (inProject && fullscreenPreview)} className="pstrip focus-rail" aria-label="Workspace navigation">
    <header className="workspace-tree__heading"><span>Projects</span><span className="workspace-tree__heading-actions"><button className="icon-btn" aria-label="New project" title="New project" onClick={openNewProject}><PlusIcon size={18} /></button><button className="icon-btn" aria-label="Hide projects sidebar" title="Hide projects sidebar" onClick={() => useWorkspaceStore.getState().setProjectsSidebarOpen(false)}><CloseIcon size={16} /></button></span></header>
    <div className="pstrip__scroll" onClick={event => {
      if (event.button === 0 && event.target instanceof Element && !event.target.closest('button')) useProjectStore.getState().goHome();
    }}><WorkspaceTree /></div>
    <footer className="pstrip__footer">
      <button className="pstrip__row" aria-label={`Remote, ${connection}`} onClick={() => useWorkspaceStore.getState().openSettingsSection('iphone')}><LinkIcon size={16} /><span className="pstrip__connection"><span>Remote</span><small role="status">{connection}</small></span><span className={`pstrip__connection-dot ${connected ? 'connected' : ''}`} aria-hidden="true" /></button>
      <ReportProblemButton />
      <button className="pstrip__row" onClick={() => useWorkspaceStore.getState().openSettings()}><GearIcon size={16} /><span className="pstrip__name">Settings</span><kbd>{keyLabel('Mod+,')}</kbd></button>
    </footer>
  </aside>;
}
