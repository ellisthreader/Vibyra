import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { COMPANION_MAX_WIDTH, COMPANION_MIN_WIDTH, type CompanionTab } from '../../lib/companionPreferences';
import { useAccountStore } from '../../state/accountStore';
import { useProjectStore } from '../../state/projectStore';
import { useProjectLaunchSettings } from '../../state/launchSettingsStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { CloseIcon } from '../common/Icons';
import { FilesPanel } from './FilesPanel';
import { DockSizeControl } from '../layout/DockSizeControl';
import { ChatPanel } from './ChatPanel';
import { useCompanionResize } from './useCompanionResize';
import { WorktreesPanel } from '../worktrees/WorktreesPanel';
import { SidebarPreview } from '../preview/SidebarPreview';
import type { PreviewScope } from '../worktrees/types';
import './sidebarDesign.css';

export function Companion({ active = true }: { active?: boolean }) {
  const account = useAccountStore(s => s.snapshot.profile?.email ?? 'guest');
  const projectId = useProjectStore(s => s.activeId);
  return <CompanionContent key={`${account}:${projectId}`} active={active} />;
}
function CompanionContent({ active }: { active: boolean }) {
  const projectId = useProjectStore(s => s.activeId);
  const safe = useProjectLaunchSettings(projectId).safeMode;
  const { companionOpen: open, companionSize: size, companionTab: savedTab, companionWidth: preferredWidth,
    setCompanionTab: setTab, setCompanionWidth: setWidth, toggleCompanion: toggle } = useWorkspaceStore();
  const tab = savedTab === 'worktrees' && !safe ? 'chat' : savedTab;
  const entries: { id: CompanionTab; label: string }[] = [
    { id: 'chat', label: 'Chat' }, ...(safe ? [{ id: 'worktrees' as const, label: 'Worktrees' }] : []), { id: 'preview', label: 'Preview' },
  ];
  const tabs = useRef<Partial<Record<CompanionTab, HTMLButtonElement | null>>>({});
  const [previewVisited, setPreviewVisited] = useState(tab === 'preview' && open);
  const [scope, setScope] = useState<PreviewScope | null>(null);
  const resize = useCompanionResize(preferredWidth, setWidth);
  useEffect(() => { if (savedTab === 'worktrees' && !safe) setTab('chat'); }, [safe, savedTab, setTab]);
  useEffect(() => { if (tab === 'preview' && open) setPreviewVisited(true); }, [tab, open]);
  const close = () => { toggle(); requestAnimationFrame(() => document.getElementById('workspace-sidebar-toggle')?.focus()); };
  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowLeft') next = (index - 1 + entries.length) % entries.length;
    else if (event.key === 'ArrowRight') next = (index + 1) % entries.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = entries.length - 1;
    else return;
    event.preventDefault(); setTab(entries[next].id); tabs.current[entries[next].id]?.focus();
  };
  return <aside id="project-companion" className="companion workspace-sidebar" data-size={size} hidden={!open}
    aria-label="Workspace sidebar" style={{ '--companion-width': `${resize.width}px` } as CSSProperties}
    onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); close(); } }}>
    {size !== 'full' && <div className="companion__resize" role="separator" aria-label="Resize project companion"
      aria-orientation="vertical" aria-valuemin={COMPANION_MIN_WIDTH} aria-valuemax={COMPANION_MAX_WIDTH} aria-valuenow={resize.width}
      tabIndex={0} onPointerDown={resize.start} onKeyDown={resize.resizeWithKeyboard} onDoubleClick={resize.reset} />}
    <header className="companion__head">
      <nav className="companion__tabs" role="tablist" aria-label="Companion tools">
        {entries.map((entry, index) => <button key={entry.id} ref={node => { tabs.current[entry.id] = node; }}
          id={`companion-tab-${entry.id}`} role="tab" aria-selected={tab === entry.id || (tab === 'files' && entry.id === 'chat')}
          aria-controls={`companion-panel-${entry.id}`} tabIndex={tab === entry.id || (tab === 'files' && entry.id === 'chat') ? 0 : -1}
          className={`companion__tab ${tab === entry.id || (tab === 'files' && entry.id === 'chat') ? 'companion__tab--active' : ''}`}
          onClick={() => setTab(entry.id)} onKeyDown={event => moveTabFocus(event, index)}>{entry.label}</button>)}
      </nav>
      <DockSizeControl />
      <button className="icon-btn companion__close" aria-label="Close sidebar" title="Close sidebar" onClick={close}><CloseIcon size={15} /></button>
    </header>
    <div className="companion__body" id="companion-panel-chat" role="tabpanel" aria-labelledby="companion-tab-chat" hidden={tab !== 'chat' && tab !== 'files'}>
      {tab === 'files' ? <><button className="worktree-back sidebar-files-back" onClick={() => setTab('chat')}>← Chat</button><FilesPanel /></>
        : <ChatPanel active={active && open && tab === 'chat'} />}
    </div>
    {safe && <div className="companion__body" id="companion-panel-worktrees" role="tabpanel" aria-labelledby="companion-tab-worktrees" hidden={tab !== 'worktrees'}>
      <WorktreesPanel active={active && open && tab === 'worktrees'} onPreview={next => { setScope(next); setTab('preview'); }} />
    </div>}
    <div className="companion__body" id="companion-panel-preview" role="tabpanel" aria-labelledby="companion-tab-preview" hidden={tab !== 'preview'}>
      {previewVisited && <SidebarPreview scope={scope} onReset={() => setScope(null)} active={active && open && tab === 'preview'} />}
    </div>
  </aside>;
}
