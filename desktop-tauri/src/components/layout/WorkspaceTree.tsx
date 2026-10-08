import { useEffect, useState } from 'react';
import { useProjects } from '../../state/settingsStore';
import { useProjectStore } from '../../state/projectStore';
import { useTerminalStore } from '../../state/terminalStore';
import { useConversationTerminals } from '../../state/conversationTerminalStore';
import { splitConversationRows } from '../../lib/conversationCards';
import { ChevronDownIcon } from '../common/Icons';
import { SessionList } from '../rail/SessionList';
import { ProjectContextMenu } from './ProjectContextMenu';
import { useAccountStore } from '../../state/accountStore';
import { projectLocked } from '../../lib/planLimits';
import { ProjectTile } from '../common/ProjectTile';
import { useChatNeeds } from '../../lib/needsYou';

interface ContextTarget { projectId: string; x: number; y: number; opener: HTMLButtonElement }

export function WorkspaceTree() {
  const projects = useProjects();
  const profile = useAccountStore(s => s.snapshot.profile);
  const active = useProjectStore(s => s.activeId);
  const view = useProjectStore(s => s.view);
  const panes = useTerminalStore(s => s.panes);
  const chatNeeds = useChatNeeds();
  const activity = useTerminalStore(s => s.activity);
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
    {projects.map((project, position) => {
      const locked = projectLocked(profile, position);
      const count = panes.filter(p => p.projectId === project.id).length
        + splitConversationRows(sessions.filter(s => s.projectId === project.id), open).live.length;
      const hasTerminals = count > 0;
      const unfolded = hasTerminals && (expanded[project.id] ?? false);
      const live = panes.filter(p => p.projectId === project.id && p.status === 'running');
      // Amber: waiting on you (a prompt or an approval). Green: an agent finished you have not seen.
      const needs = chatNeeds.filter(n => n.projectId === project.id);
      const signal = live.some(p => activity[p.id] === 'attention') || needs.some(n => n.kind === 'approval') ? 'attention'
        : needs.length ? 'done' : live.some(p => activity[p.id] === 'working') ? 'working' : '';
      const showSignal = signal !== '' && !(unfolded && view === 'project' && active === project.id);
      return <section key={project.id} aria-label={project.name}>
        <button className={`workspace-tree__row ${view === 'project' && active === project.id ? 'is-active' : ''} ${locked ? 'is-locked' : ''}`}
          title={locked ? 'Free includes one project. Get Vibyra Pro, or remove another project, to use this one.' : undefined}
          aria-current={view === 'project' && active === project.id ? 'page' : undefined}
          onPointerDown={event => { if (event.button === 2) { event.preventDefault(); showContext(project.id, event.currentTarget, event.clientX, event.clientY); } }}
          onContextMenu={event => { event.preventDefault(); showContext(project.id, event.currentTarget, event.clientX, event.clientY); }}
          onKeyDown={event => { if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) { event.preventDefault(); showContext(project.id, event.currentTarget, 0, 0); } }}
          onClick={() => {
            if (view === 'project' && active === project.id) {
              useProjectStore.getState().goHome();
              return;
            }
            if (hasTerminals) setExpanded(value => ({ ...value, [project.id]: true }));
            void useProjectStore.getState().activate(project.id);
          }}>
          <ProjectTile id={project.id} name={project.name} />
          <span className="pstrip__name">{project.name}</span>
          {locked && <span className="pro-mark" aria-label="Needs Vibyra Pro">Pro</span>}
          {hasTerminals && <span className="workspace-tree__disclosure-space" />}
          {showSignal ? <span className={`pstrip__dot pstrip__dot--${signal}`} aria-label={signal === 'attention' ? 'Needs you' : signal === 'done' ? 'Agent finished' : 'Working'} />
            : hasTerminals && <span className="workspace-tree__count">{count}</span>}
        </button>
        {hasTerminals && <button className="workspace-tree__disclosure" aria-label={`${unfolded ? 'Collapse' : 'Expand'} sessions for ${project.name}`} aria-expanded={unfolded} onClick={() => setExpanded(value => ({ ...value, [project.id]: !unfolded }))}><span className={unfolded ? '' : 'workspace-tree__collapsed'}><ChevronDownIcon size={12} /></span></button>}
        {unfolded && <div className="workspace-tree__sessions">
          <SessionList query="" projectId={project.id} />
        </div>}
      </section>;
    })}
    {!projects.length && <p className="pstrip__empty">Add a workspace to get started.</p>}
    {context && contextProject && <ProjectContextMenu key={context.projectId} project={contextProject} sessionCount={contextCount} x={context.x} y={context.y} opener={context.opener} onDismiss={() => setContext(null)} />}
  </div>;
}
