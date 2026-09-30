import { useMemo, useState } from 'react';
import type { ProjectSpec } from '../../types';
import { homeRelative } from '../../lib/homeRelative';
import { useProjectStore } from '../../state/projectStore';
import { useDialogFocus } from '../teammates/useDialogFocus';
import { CheckIcon, ClockIcon, FolderIcon, HomeIcon, PlusIcon, SearchIcon } from '../common/Icons';

interface Props {
  projects: ProjectSpec[];
  activeId: string | null;
  onClose: () => void;
  onHistory: () => void;
}

/**
 * The menu under the project name. Most recent first, filtered as you type,
 * driven from the keyboard: arrows move, Enter switches, Escape closes.
 * The current project carries a check so a glance answers "where am I?".
 */
export function ProjectPickerMenu({ projects, activeId, onClose, onHistory }: Props) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const dialog = useDialogFocus(true, onClose);
  const listed = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...projects]
      .sort((a, b) => b.lastOpenedMs - a.lastOpenedMs)
      .filter(p => !term || p.name.toLowerCase().includes(term) || homeRelative(p.root).toLowerCase().includes(term));
  }, [projects, query]);
  const highlighted = Math.min(cursor, Math.max(0, listed.length - 1));

  const choose = (id: string) => {
    onClose();
    if (id !== activeId) void useProjectStore.getState().activate(id);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(Math.min(highlighted + 1, listed.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(Math.max(highlighted - 1, 0)); }
    else if (event.key === 'Enter' && listed[highlighted]) { event.preventDefault(); choose(listed[highlighted].id); }
  };

  return <>
    <button type="button" className="project-picker__dismiss" aria-label="Close project picker" onClick={onClose} />
    <section
      className="project-picker"
      role="dialog"
      aria-label="Switch project"
      ref={node => { dialog.current = node; }}
      onKeyDown={onKeyDown}
    >
      <label className="project-picker__search">
        <SearchIcon size={15} />
        <input
          aria-label="Find a project"
          placeholder="Find a project"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={event => { setQuery(event.target.value); setCursor(0); }}
        />
      </label>
      <div className="project-picker__list" role="listbox" aria-label="Projects">
        {listed.map((project, index) => (
          <button
            key={project.id}
            type="button"
            role="option"
            aria-selected={project.id === activeId}
            className={`project-picker__row${index === highlighted ? ' is-highlighted' : ''}`}
            onMouseMove={() => setCursor(index)}
            onClick={() => choose(project.id)}
          >
            <span className="project-picker__icon"><FolderIcon size={16} /></span>
            <span className="project-picker__copy">
              <strong>{project.name}</strong>
              <small>{homeRelative(project.root)}</small>
            </span>
            {project.id === activeId && <CheckIcon size={15} />}
          </button>
        ))}
        {!listed.length && (
          <p className="project-picker__empty">
            {projects.length ? `Nothing called “${query.trim()}”.` : 'No projects yet. Open a folder to start one.'}
          </p>
        )}
      </div>
      <div className="project-picker__foot">
        <button type="button" onClick={() => { onClose(); void useProjectStore.getState().pickAndCreate(); }}>
          <PlusIcon size={15} />Open a folder
        </button>
        <button type="button" onClick={onHistory}><ClockIcon size={15} />Saved history</button>
        <button type="button" onClick={() => { onClose(); useProjectStore.getState().goHome(); }}>
          <HomeIcon size={15} />Manage projects
        </button>
      </div>
    </section>
  </>;
}
