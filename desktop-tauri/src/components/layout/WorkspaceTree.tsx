import { useEffect, useState } from 'react';
import { useProjects } from '../../state/settingsStore';
import { useProjectStore } from '../../state/projectStore';
import { useTerminalStore } from '../../state/terminalStore';
import { useConversationTerminals } from '../../state/conversationTerminalStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { splitConversationRows } from '../../lib/conversationCards';
import { ChevronDownIcon, PlusIcon } from '../common/Icons';
import { SessionList } from '../rail/SessionList';
import { ProjectContextMenu } from './ProjectContextMenu';

interface ContextTarget { projectId: string; x: number; y: number; opener: HTMLButtonElement }

export function WorkspaceTree() {
  const projects = useProjects();
  const active = useProjectStore(s => s.activeId);
  const panes = useTerminalStore(s => s.panes);
  const sessions = useConversationTerminals(s => s.sessions);
  const open = useConversationTerminals(s => s.open);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [context, setContext] = useState<ContextTarget | null>(null);
  useEffect(() => { if (active) setExpanded(value => ({ ...value, [active]: true })); }, [active]);
  const contextProject = projects.find(project => project.id === context?.projectId);
  const contextCount = contextProject ? panes.filter(p => p.projectId === contextProject.id).length
    + splitConversationRows(sessions.filter(s => s.projectId === contextProject.id), open).live.length : 0;
  function showContext(projectId: string, opener: HTMLButtonElement, x: number, y: number) {
    const rect = opener.getBoundingClientRect();
    setContext({ projectId, opener, x: x || rect.left + 20, y: y || rect.bottom });
  }
  return <div className="workspace-tree">
    {projects.map(project => {
      const count = panes.filter(p => p.projectId === project.id).length
        + splitConversationRows(sessions.filter(s => s.projectId === project.id), open).live.length;
      const hasTerminals = count > 0;
      const unfolded = hasTerminals && (expanded[project.id] ?? false);
      return <section key={project.id} aria-label={project.name}>
        <button className={`workspace-tree__row ${active === project.id ? 'is-active' : ''}`}
          onPointerDown={event => { if (event.button === 2) { event.preventDefault(); showContext(project.id, event.currentTarget, event.clientX, event.clientY); } }}
          onContextMenu={event => { event.preventDefault(); showContext(project.id, event.currentTarget, event.clientX, event.clientY); }}
          onKeyDown={event => { if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) { event.preventDefault(); showContext(project.id, event.currentTarget, 0, 0); } }}
          aria-expanded={hasTerminals ? unfolded : undefined} onClick={() => {
            if (hasTerminals) setExpanded(value => ({ ...value, [project.id]: !unfolded }));
            if (!unfolded && active !== project.id) void useProjectStore.getState().activate(project.id);
          }}>
          <span className="pstrip__name">{project.name}</span>
          {hasTerminals && <><span className={unfolded ? '' : 'workspace-tree__collapsed'}><ChevronDownIcon size={12} /></span><span className="workspace-tree__count">{count}</span></>}
        </button>
        {unfolded && <div className="workspace-tree__sessions">
          <SessionList query="" projectId={project.id} />
          <button className="workspace-tree__new" aria-label={`New terminal in ${project.name}`} onClick={async () => {
            if (active !== project.id) await useProjectStore.getState().activate(project.id);
            useWorkspaceStore.getState().openAgentPicker();
          }}><span className="workspace-tree__mark"><PlusIcon size={14} /></span><span>New terminal</span></button>
        </div>}
      </section>;
    })}
    {!projects.length && <p className="pstrip__empty">Add a workspace to get started.</p>}
    {context && contextProject && <ProjectContextMenu key={context.projectId} project={contextProject} sessionCount={contextCount} x={context.x} y={context.y} opener={context.opener} onDismiss={() => setContext(null)} />}
  </div>;
}
