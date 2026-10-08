import { useEffect, useRef, useState } from 'react';
import type { SharedSession } from '../../ipc/sharedChats';
import { conversationAgent } from '../../lib/conversationAgent';
import { agentIdentity } from '../../lib/agentIdentity';
import { AgentLogo } from '../common/AgentLogo';
import { CloseIcon } from '../common/Icons';
import { ChatChevronIcon, ChatPlusIcon, ChatTerminalIcon } from '../chat/chatIcons';

/**
 * The thread bar above a full-page chat, as in the ChatGPT and Claude apps:
 * one tab per open chat, + for a new one, earlier chats under History, and a
 * way back to the project's terminals when some are running.
 */
export function ChatThreadTabs({ threads, history, active, composing, terminals, onSelect, onClose, onNew, onReopen, onTerminals }: {
  threads: SharedSession[]; history: SharedSession[]; active: string | null; composing: boolean; terminals: number;
  onSelect(id: string): void; onClose(session: SharedSession): void; onNew(): void; onReopen(id: string): void; onTerminals(): void;
}) {
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', away); return () => document.removeEventListener('mousedown', away);
  }, [menu]);
  return <nav className="chat-threads__bar" aria-label="Chats">
    <div className="chat-threads__tabs" role="tablist">
      {threads.map(session => {
        const agent = conversationAgent(session.kind);
        const on = !composing && session.id === active;
        return <div key={session.id} role="tab" aria-selected={on} tabIndex={0} title={session.title}
          className={`chat-thread ${on ? 'is-on' : ''} ${session.status === 'running' ? '' : 'is-paused'}`}
          onClick={() => onSelect(session.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(session.id); } }}
          onAuxClick={event => { if (event.button === 1) onClose(session); }}>
          <AgentLogo agentId={agent.id} name={agentIdentity(agent.id).name} size={16} className="chat-thread__logo" />
          <span className="chat-thread__title">{session.title}</span>
          <button type="button" className="chat-thread__close" aria-label={`Close ${session.title}`} title="Close chat"
            onClick={event => { event.stopPropagation(); onClose(session); }}><CloseIcon size={11} /></button>
        </div>;
      })}
      {composing && <div role="tab" aria-selected className="chat-thread is-on is-new"><span className="chat-thread__title">New chat</span></div>}
      <button type="button" className="chat-threads__new" aria-label="New chat" title="New chat" onClick={onNew}><ChatPlusIcon size={15} /></button>
    </div>
    <div className="chat-threads__tools">
      {terminals > 0 && <button type="button" className="chat-threads__tool" onClick={onTerminals} title="Show this project's terminals">
        <ChatTerminalIcon size={14} />{terminals} {terminals === 1 ? 'terminal' : 'terminals'}</button>}
      <div ref={box} className="chat-threads__history">
        <button type="button" className="chat-threads__tool" aria-haspopup="menu" aria-expanded={menu} disabled={!history.length}
          onClick={() => setMenu(!menu)}>History<span className="chat-threads__chevron"><ChatChevronIcon size={10} /></span></button>
        {menu && <div className="chat-threads__menu" role="menu" aria-label="Earlier chats">
          {history.map(session => {
            const agent = conversationAgent(session.kind);
            return <button type="button" role="menuitem" key={session.id} onClick={() => { setMenu(false); onReopen(session.id); }}>
              <AgentLogo agentId={agent.id} name={agentIdentity(agent.id).name} size={16} className="chat-thread__logo" />
              <span className="chat-thread__title">{session.title}</span>
              {session.createdAt && <small>{new Date(session.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small>}
            </button>;
          })}
        </div>}
      </div>
    </div>
  </nav>;
}
