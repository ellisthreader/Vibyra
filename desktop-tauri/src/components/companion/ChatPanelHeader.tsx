import { useEffect, useRef, useState } from 'react';
import { MoreIcon } from '../common/Icons';
import { useWorkspaceStore } from '../../state/workspaceStore';

export function ChatPanelHeader({ hasTurns, onClear }: { hasTurns: boolean; onClear(): void }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className="chat-context">
    <span className="chat-context__label">Workspace chat</span>
    <button className="chat-files" aria-label="Open project files" title="Project files"
      onClick={() => useWorkspaceStore.getState().setCompanionTab('files')}>
      <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M2.5 5.5h6l1.5 2h7.5v9h-15zM2.5 5.5v-2h6l1.5 2h7.5v2"/></svg>Files
    </button>
    {hasTurns && <div className="chat-menu" ref={menu} onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    }}>
      <button ref={trigger} className="icon-btn" aria-label="Conversation options" title="Conversation options"
        aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(v => !v)}><MoreIcon size={14}/></button>
      {open && <div className="chat-menu__popover" role="menu"><button role="menuitem" autoFocus onClick={() => { onClear(); setOpen(false); trigger.current?.focus(); }}>Clear conversation</button></div>}
    </div>}
  </div>;
}
