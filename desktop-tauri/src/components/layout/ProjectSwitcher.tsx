import { useState } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useProjects } from '../../state/settingsStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { ChevronDownIcon } from '../common/Icons';
import { ProjectPickerMenu } from './ProjectPickerMenu';

/** The project's name at the top of the column. Press it to switch project. */
export function ProjectSwitcher({ compact = false }: { compact?: boolean }) {
  const projects = useProjects(); const active = useProjectStore(s => s.activeId);
  const [open, setOpen] = useState(false);
  return <div className="project-switcher">
    <button type="button" className={compact ? "pstrip__row" : "project-focus-title"} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span>{compact ? 'Workspace options' : projects.find(p => p.id === active)?.name ?? 'Your workspace'}</span><ChevronDownIcon size={15} />
    </button>
    {open && <ProjectPickerMenu projects={projects} activeId={active} onClose={() => setOpen(false)} onHistory={() => { setOpen(false); useWorkspaceStore.getState().setHistoryOpen(true); }} />}
  </div>;
}
