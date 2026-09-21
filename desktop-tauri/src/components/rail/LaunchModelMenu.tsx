import { useEffect, useRef, useState } from 'react';
import { ProviderMark } from '../common/AgentMark';
import { CheckIcon, SearchIcon } from '../common/Icons';
import type { LaunchableModel } from './LaunchModelPicker';
import '../../styles/launch-model-menu.css';

interface Props {
  models: LaunchableModel[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onBrowseAll: () => void;
}

/** In-flow expansion: the list scrolls without a viewport-covering backdrop. */
export function LaunchModelMenu({ models, selectedId, onSelect, onClose, onBrowseAll }: Props) {
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const filtered = models.filter(({ model, group }) =>
    `${model.label} ${group.company}`.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = [...new Set(filtered.map(entry => entry.group.company))];
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    search.current?.focus({ preventScroll: true });
    root.current?.scrollIntoView({ block: 'nearest' });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { if (list.current) list.current.scrollTop = 0; }, [query]);
  return <div className="launch-model-browser" ref={root} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const rows = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
      const index = rows.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0 && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
      rows[next]?.focus();
    }
  }}>
    <div className="launch-model-browser__search"><SearchIcon size={15} />
      <input ref={search} aria-label="Search models" placeholder="Search models…" value={query} onChange={event => setQuery(event.target.value)} />
      <button type="button" aria-label="Close model list" onClick={onClose}>×</button>
    </div>
    <div ref={list} className="launch-model-browser__list" role="listbox" aria-label="All models">
      {groups.map(company => <div key={company} role="group" aria-label={company}>
        <div className="launch-model-browser__company" aria-hidden="true">{company}</div>
        {filtered.filter(entry => entry.group.company === company).map(({ model, group }) => <button
          key={model.id} type="button" role="option" aria-selected={model.id === selectedId}
          className="launch-model-browser__option" onClick={() => onSelect(model.id)}>
          <ProviderMark provider={group.providerKey} label={company} accent={group.accent} size={22} />
          <span>{model.label}</span>{model.id === selectedId && <CheckIcon size={14} />}
        </button>)}
      </div>)}
      {!filtered.length && <p className="launch-model-browser__empty">No models found.</p>}
    </div>
    <button type="button" className="launch-model-browser__browse" onClick={onBrowseAll}>Browse full catalog <span aria-hidden="true">↗</span></button>
  </div>;
}
