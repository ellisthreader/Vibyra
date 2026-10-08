import { useEffect, useRef } from 'react';
import { GROUP_TITLES, type CommandIcon, type Suggestion } from './chatCommands';
import { ChatAlertIcon, ChatBulbIcon, ChatCopyIcon, ChatCubeIcon, ChatDiffIcon, ChatEyeIcon, ChatFileIcon, ChatGaugeIcon, ChatHelpIcon,
  ChatInfoIcon, ChatLayersIcon, ChatPlusIcon, ChatPulseIcon, ChatShieldIcon, ChatStopIcon, ChatTerminalIcon } from './chatIcons';
import { CheckIcon } from '../common/Icons';

const ICONS: Record<CommandIcon, ReturnType<typeof import('../common/iconFactory').icon>> = {
  model: ChatCubeIcon, effort: ChatPulseIcon, stop: ChatStopIcon, new: ChatPlusIcon, copy: ChatCopyIcon, review: ChatEyeIcon,
  init: ChatFileIcon, diff: ChatDiffIcon, context: ChatLayersIcon, status: ChatInfoIcon, usage: ChatGaugeIcon,
  permissions: ChatShieldIcon, help: ChatHelpIcon, terminal: ChatTerminalIcon,
};

/** "/mo" typed: the matching part of a name marked, the rest as is. */
function Name({ text, typed }: { text: string; typed: string }) {
  const at = typed ? text.toLowerCase().indexOf(typed.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + typed.length)}</mark>{text.slice(at + typed.length)}</>;
}

/**
 * The "/" menu above the composer: one quiet line per command (icon, name,
 * what it does), grouped while browsing, then the choices for /model and
 * /effort once their argument is typed. The composer owns the keys.
 */
export function ChatCommandMenu({ items, active, loading, error, query, onChoose, onHover }: {
  items: Suggestion[]; active: number; loading: boolean; error: string; query: string;
  onChoose(item: Suggestion): void; onHover(index: number): void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);
  const typingName = !query.includes(' ');
  const typed = typingName ? (query ? `/${query}` : '') : query.slice(query.indexOf(' ') + 1).trim();
  const arg = items[0]?.group === 'arg';
  return <div className="chat-commands" role="listbox" aria-label="Commands">
    <div ref={list} className="chat-commands__rows">
      {items.map((item, index) => {
        const Glyph = item.disabled ? ChatAlertIcon : ICONS[item.icon] ?? ChatBulbIcon;
        const heading = typingName && !query && (index === 0 || items[index - 1].group !== item.group);
        return <div key={`${item.group}:${item.key}`} role="presentation">
          {heading && <p className="chat-commands__group">{GROUP_TITLES[item.group as keyof typeof GROUP_TITLES]}</p>}
          <button type="button" role="option" data-index={index} aria-selected={index === active} aria-disabled={item.disabled}
            className={`chat-commands__row ${index === active ? 'is-active' : ''} ${item.disabled ? 'is-native' : ''}`}
            onMouseMove={() => { if (index !== active) onHover(index); }} onMouseDown={event => event.preventDefault()} onClick={() => onChoose(item)}>
            <span className="chat-commands__icon"><Glyph size={15} /></span>
            <span className="chat-commands__name"><Name text={item.title} typed={typed} /></span>
            <span className="chat-commands__detail">{item.detail}</span>
            {item.current && <span className="chat-commands__current" aria-label="Current"><CheckIcon size={13} /></span>}
          </button>
        </div>;
      })}
      {!items.length && <p className="chat-commands__empty">{loading ? 'Loading commands…' : error || (typingName ? `No command called “/${query}”.` : 'Nothing matches.')}</p>}
    </div>
    <footer className="chat-commands__foot" aria-hidden="true">
      <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
      <span><kbd>↵</kbd> {arg ? 'choose' : 'run'}</span>
      {!arg && typingName && <span><kbd>tab</kbd> complete</span>}
      <span><kbd>esc</kbd> close</span>
    </footer>
  </div>;
}
