import { useProjectStore } from '../../state/projectStore';
import { openNewProject } from '../../state/newProject';
import '../../styles/workspace-tree.css';
import { usePhoneStore } from '../../state/phoneStore';
import { keyLabel } from '../../lib/platform';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { GearIcon, PlusIcon, LinkIcon } from '../common/Icons';
import { WorkspaceTree } from './WorkspaceTree';
export function ProjectStrip() {
  const inProject = useProjectStore(s => s.view === 'project');
  const fullscreenPreview = useWorkspaceStore(s => s.companionOpen && s.companionTab === 'preview' && s.companionSize === 'full');
  const phone = usePhoneStore(s => s.status);
  const connected = Boolean(phone?.active.length);
  const connection = !phone ? 'Checking connection' : connected ? 'Phone connected' : 'No phone connected';
  return <aside hidden={inProject && fullscreenPreview} className="pstrip focus-rail" aria-label="Workspace navigation">
    <header className="workspace-tree__heading"><span>Projects</span><button className="icon-btn" aria-label="New project" title="New project" onClick={openNewProject}><PlusIcon size={18} /></button></header>
    <div className="pstrip__scroll"><WorkspaceTree /></div>
    <footer className="pstrip__footer">
      <button className="pstrip__row" aria-label={`Remote, ${connection}`} onClick={() => useWorkspaceStore.getState().openSettingsSection('iphone')}><LinkIcon size={16} /><span className="pstrip__connection"><span>Remote</span><small role="status">{connection}</small></span><span className={`pstrip__connection-dot ${connected ? 'connected' : ''}`} aria-hidden="true" /></button>
      <button className="pstrip__row" onClick={() => useWorkspaceStore.getState().openSettings()}><GearIcon size={16} /><span className="pstrip__name">Settings</span><kbd>{keyLabel('Mod+,')}</kbd></button>
    </footer>
  </aside>;
}
