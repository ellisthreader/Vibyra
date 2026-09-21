import { useEffect, useState } from 'react';
import { useProjects } from '../../state/settingsStore';
import { useProjectStore } from '../../state/projectStore';
import { useTerminalStore } from '../../state/terminalStore';
import { useConversationTerminals } from '../../state/conversationTerminalStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { splitConversationRows } from '../../lib/conversationCards';
import { ChevronDownIcon, PlusIcon } from '../common/Icons';
import { SessionList } from '../rail/SessionList';

export function WorkspaceTree() {
  const projects = useProjects();
  const active = useProjectStore(s => s.activeId);
  const panes = useTerminalStore(s => s.panes);
  const sessions = useConversationTerminals(s => s.sessions);
  const open = useConversationTerminals(s => s.open);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => { if (active) setExpanded(value => ({ ...value, [active]: true })); }, [active]);
  return <div className="workspace-tree">
    {projects.map(project => {
      const count = panes.filter(p => p.projectId === project.id).length
        + splitConversationRows(sessions.filter(s => s.projectId === project.id), open).live.length;
      const unfolded = expanded[project.id] ?? false;
      return <section key={project.id} aria-label={project.name}>
        <button className={`workspace-tree__row ${active === project.id ? 'is-active' : ''}`}
          aria-expanded={unfolded} onClick={() => {
            setExpanded(value => ({ ...value, [project.id]: !unfolded }));
            if (!unfolded && active !== project.id) void useProjectStore.getState().activate(project.id);
          }}>
          <span className="pstrip__name">{project.name}</span>
          {count > 0 && <><span className={unfolded ? '' : 'workspace-tree__collapsed'}><ChevronDownIcon size={12} /></span><span className="workspace-tree__count">{count}</span></>}
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
  </div>;
}
