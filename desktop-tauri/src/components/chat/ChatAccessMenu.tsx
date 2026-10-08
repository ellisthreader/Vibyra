import { useEffect, useRef, useState } from 'react';
import { CheckIcon } from '../common/Icons';
import { AccessIcon } from './AccessIcon';
import { ACCESS_LEVELS, accessWords, type ChatAccess } from './useChatAccess';

/** What the chat may do without asking, set on the Mac only and applied from the next message. */
export function ChatAccessMenu({ access, onClose }: { access: ChatAccess; onClose(): void }) {
  const [active, setActive] = useState(() => ACCESS_LEVELS.indexOf(access.level));
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { menu.current?.focus(); }, []);
  const choose = async (index: number) => {
    const level = ACCESS_LEVELS[index];
    if (!level || access.saving) return;
    if (await access.choose(level)) onClose();
  };
  return <div ref={menu} tabIndex={-1} className="chat-pop" role="listbox" aria-label="Access" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(ACCESS_LEVELS.length - 1, index + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); void choose(active); }
  }}>
    <header className="chat-pop__head"><strong>Access</strong><span>What it may do without asking</span></header>
    <div className="chat-pop__rows">
      {ACCESS_LEVELS.map((level, index) => {
        const words = accessWords(level, access.provider);
        return <button type="button" role="option" key={level} aria-selected={level === access.level} disabled={access.saving || !access.live}
          className={`chat-pop__row ${index === active ? 'is-active' : ''} ${level === 'full' ? 'is-warn' : ''}`}
          onMouseEnter={() => setActive(index)} onClick={() => void choose(index)}>
          <span className="chat-pop__glyph"><AccessIcon level={level} size={15} /></span>
          <span className="chat-pop__text"><strong>{words.label}</strong><small>{words.hint}</small></span>
          <span className="chat-pop__tick">{level === access.level && <CheckIcon size={13} />}</span>
        </button>;
      })}
      {access.error && <p className="chat-pop__note is-error" role="alert">{access.error}</p>}
    </div>
    <footer className="chat-pop__foot">{access.live ? 'Applies from your next message. Only this Mac can change it.' : 'Resume this chat to change its access.'}</footer>
  </div>;
}
