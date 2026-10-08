import { useEffect, useRef, useState } from 'react';
import { CheckIcon } from '../common/Icons';
import { EffortBars } from './EffortBars';
import { effortWords, type ChatModels } from './useChatModels';

/** How hard the model thinks: the levels it offers, cheapest first. */
export function ChatEffortMenu({ models: state, onClose }: { models: ChatModels; onClose(): void }) {
  const { ladder, effort, saving, managed, name } = state;
  const [active, setActive] = useState(() => Math.max(0, ladder.indexOf(effort ?? '')));
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { menu.current?.focus(); }, []);
  const choose = async (level?: string) => {
    if (!level || saving) return;
    if (level === effort || await state.chooseEffort(level)) onClose();
  };
  const note = !state.live ? 'Thinking levels load once this chat is running.' : state.loading ? 'Loading…'
    : managed ? `${name} decides how long to think.` : 'This model has one thinking level.';
  return <div ref={menu} tabIndex={-1} className="chat-pop chat-pop--narrow" role="listbox" aria-label="Thinking effort" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(ladder.length - 1, index + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); void choose(ladder[active]); }
  }}>
    <header className="chat-pop__head"><strong>Thinking effort</strong><span>{name}</span></header>
    <div className="chat-pop__rows">
      {ladder.map((level, index) => <button type="button" role="option" key={level} aria-selected={level === effort} disabled={saving}
        className={`chat-pop__row ${index === active ? 'is-active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => void choose(level)}>
        <span className="chat-pop__glyph"><EffortBars index={index} count={ladder.length} /></span>
        <span className="chat-pop__text"><strong>{effortWords(level).label}</strong><small>{effortWords(level).hint}</small></span>
        <span className="chat-pop__tick">{level === effort && <CheckIcon size={13} />}</span>
      </button>)}
      {!ladder.length && <p className="chat-pop__note">{state.error || note}</p>}
      {state.error && ladder.length > 0 && <p className="chat-pop__note is-error" role="alert">{state.error}</p>}
    </div>
    <footer className="chat-pop__foot">Applies from your next message.</footer>
  </div>;
}
