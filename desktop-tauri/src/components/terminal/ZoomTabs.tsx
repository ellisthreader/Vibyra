import { useTerminalStore } from '../../state/terminalStore';

export interface ZoomTab { key: string; title: string }

/** The other terminals as tabs above the one shown full size. Each tab carries
 * the same state dot as the sidebar; reading activity here keeps the stage
 * itself from re-rendering on every activity tick. */
export function ZoomTabs({ items, active, onSelect }: { items: ZoomTab[]; active: string; onSelect: (key: string) => void }) {
  const panes = useTerminalStore(s => s.panes);
  const activity = useTerminalStore(s => s.activity);
  const dot = (key: string) => {
    if (!key.startsWith('pty:')) return '';
    const pane = panes.find(p => p.id === Number(key.slice(4)));
    if (!pane || pane.status !== 'running') return '';
    return activity[pane.id] === 'attention' ? 'attention' : activity[pane.id] === 'working' ? 'working' : '';
  };
  return <div className="adaptive-tabs" aria-label="Switch maximised terminal">
    {items.map(item => { const state = dot(item.key); return <button key={item.key} aria-pressed={item.key === active} onClick={() => onSelect(item.key)}>
      {state && <span className={`pstrip__dot pstrip__dot--${state}`} aria-hidden="true" />}{item.title}
    </button>; })}
  </div>;
}
