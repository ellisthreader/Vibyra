import { useEffect, useState } from 'react';
import { LaunchSettingsPanel } from '../rail/LaunchSettings';
import { useTerminalGrid } from '../../lib/useTerminalGrid';
import { adaptiveTerminals } from '../../lib/adaptiveTerminals';
import { useProjectStore } from '../../state/projectStore';
import { useSettingsStore } from '../../state/settingsStore';
import { paneLabel, useTerminalStore } from '../../state/terminalStore';
import { useConversationTerminals } from '../../state/conversationTerminalStore';
import { ConversationTerminalPane } from './ConversationTerminalPane';
import { TerminalPaneCard } from './TerminalPaneCard';
import { AdaptivePane } from './AdaptivePane';

export function TerminalStage({ active = true }: { active?: boolean }) {
  const projectId = useProjectStore(s => s.activeId);
  const allPanes = useTerminalStore(s => s.panes);
  const focusedId = useTerminalStore(s => s.focusedId);
  const zoomedId = useTerminalStore(s => s.zoomedId);
  const fontSize = useSettingsStore(s => s.settings?.fontSize ?? 13);
  const conversations = useConversationTerminals();
  const panes = allPanes.filter(p => p.projectId === projectId);
  const shared = conversations.sessions.filter(s => s.projectId === projectId && conversations.open.includes(s.id))
    .sort((a, b) => conversations.open.indexOf(a.id) - conversations.open.indexOf(b.id));
  const items = [...shared.map(s => ({ key: `chat:${s.id}`, shell: false, title: s.title })),
    ...panes.map(p => ({ key: `pty:${p.id}`, shell: p.agentId === 'shell' || p.agentId === 'ssh', title: paneLabel(p) }))];
  const zoomed = zoomedId !== null ? `pty:${zoomedId}` : conversations.zoomed ? `chat:${conversations.zoomed}` : null;
  const layout = adaptiveTerminals(items, zoomed);
  const [columns, setColumns] = useState<HTMLDivElement | null>(null);
  const gridStyle = useTerminalGrid(columns, items.length);
  const [max, setMax] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await useConversationTerminals.getState().refresh(); if (alive) timer = setTimeout(poll, 3000); };
    void poll(); return () => { alive = false; clearTimeout(timer); };
  }, [active]);
  const select = (key: string) => {
    if (key.startsWith('pty:')) { useConversationTerminals.setState({ focused: null, zoomed: null }); const id = Number(key.slice(4)); useTerminalStore.getState().setFocus(id); if (layout.max && useTerminalStore.getState().zoomedId !== id) useTerminalStore.getState().toggleZoom(id); }
    else { const id = key.slice(5); useConversationTerminals.getState().reveal(id); if (layout.max) useConversationTerminals.getState().toggleZoom(id); }
  };
  const target = () => layout.max ? max : columns;
  const hidden = (key: string) => Boolean(layout.max && key !== layout.max);
  return <div className="workspace__body terminal-stage adaptive-stage">
    {conversations.saveError && <p role="alert" className="shared-error">{conversations.saveError}</p>}
    {conversations.error && <p role="alert" className="shared-error">{conversations.error}</p>}
    {!items.length && <div className="grid-empty launch-stage"><LaunchSettingsPanel /></div>}
    {layout.max && <div className="adaptive-tabs" aria-label="Switch maximised terminal">{items.map(i => <button key={i.key} aria-pressed={i.key === layout.max} onClick={() => select(i.key)}>{i.title}</button>)}</div>}
    <div className="adaptive-layout" hidden={Boolean(layout.max) || !items.length}>
      <div className="adaptive-grid" ref={setColumns} style={gridStyle.style} />
    </div>
    <div className="adaptive-max" ref={setMax} hidden={!layout.max} />
    {shared.map((session, index) => <AdaptivePane key={`chat:${session.id}`} placement={layout.max ? undefined : gridStyle.cells[index]} target={target()} focused={focusedId === null && conversations.focused === session.id} hidden={hidden(`chat:${session.id}`)}>
      <ConversationTerminalPane session={session} hidden={hidden(`chat:${session.id}`)} active={active} fontSize={fontSize} />
    </AdaptivePane>)}
    {panes.map((pane, index) => <AdaptivePane key={`pty:${pane.id}`} placement={layout.max ? undefined : gridStyle.cells[shared.length + index]} target={target()} focused={focusedId === pane.id} hidden={hidden(`pty:${pane.id}`)}>
      <TerminalPaneCard pane={pane} hidden={hidden(`pty:${pane.id}`)} fontSize={fontSize} density="compact" />
    </AdaptivePane>)}
  </div>;
}
