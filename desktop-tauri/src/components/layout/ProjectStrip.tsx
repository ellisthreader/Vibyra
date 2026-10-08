import { useProjectStore } from '../../state/projectStore';
import { openNewProject } from '../../state/newProject';
import '../../styles/workspace-tree.css';
import { keyLabel } from '../../lib/platform';
import { useProjects } from '../../state/settingsStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { GearIcon, PlusIcon, CloseIcon } from '../common/Icons';
import { ReportProblemButton } from '../report/ReportProblemButton';
import { FrameIdentity } from './FrameIdentity';
import { FrameNav } from './FrameNav';
import { WorkspaceTree } from './WorkspaceTree';

/** The Code sidebar: workspace and search, Home and Needs you, the project
 * tree, then Report a problem and Settings. Device state lives in the status bar. */
export function ProjectStrip() {
  const inProject = useProjectStore(s => s.view === 'project');
  const fullscreenPreview = useWorkspaceStore(s => s.companionOpen && s.companionTab === 'preview' && s.companionSize === 'full');
  const sidebarOpen = useWorkspaceStore(s => s.projectsSidebarOpen);
  const projects = useProjects();
  return <aside hidden={!sidebarOpen || (inProject && fullscreenPreview)} className={`pstrip focus-rail frame-rail ${inProject ? '' : 'frame-rail--away'}`} aria-label="Workspace navigation">
    <FrameIdentity />
    <FrameNav />
    <header className="workspace-tree__heading"><span>Projects</span><span className="workspace-tree__heading-actions">
      <span className="workspace-tree__heading-count" aria-hidden="true">{projects.length || ''}</span>
      <button className="icon-btn" aria-label="New project" title="New project" onClick={openNewProject}><PlusIcon size={16} /></button>
      <button className="icon-btn" aria-label="Hide projects sidebar" title="Hide projects sidebar" onClick={() => useWorkspaceStore.getState().setProjectsSidebarOpen(false)}><CloseIcon size={14} /></button>
    </span></header>
    <div className="pstrip__scroll" onClick={event => {
      if (event.button === 0 && event.target instanceof Element && !event.target.closest('button')) useProjectStore.getState().goHome();
    }}><WorkspaceTree /></div>
    <footer className="pstrip__footer">
      <ReportProblemButton />
      <button className="pstrip__row" onClick={() => useWorkspaceStore.getState().openSettings()}><GearIcon size={16} /><span className="pstrip__name">Settings</span><kbd>{keyLabel('Mod+,')}</kbd></button>
    </footer>
  </aside>;
}
