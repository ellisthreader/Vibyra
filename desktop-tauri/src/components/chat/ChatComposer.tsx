import { useLayoutEffect, type ReactNode, type RefObject } from 'react';
import { ChatArrowUpIcon, ChatSlashIcon } from './chatIcons';

/**
 * The phone chat's composer on the Mac: one rounded box that grows with the
 * draft, attach and the model/effort pill on the left, commands, dictation and
 * one round Send (or Stop) button on the right. Enter sends, Shift+Enter breaks.
 */
export function ChatComposer({ input, draft, agentName, working, canSend, canStop, busy, attach, settings, voice, extra, panel, onMenuKey,
  onChange, onSubmit, onStop, onCommands, onFocus, onSelect }: {
  input: RefObject<HTMLTextAreaElement | null>; draft: string; agentName: string;
  working: boolean; canSend: boolean; canStop: boolean; busy: boolean;
  attach: ReactNode; settings: ReactNode; voice: ReactNode; extra?: ReactNode;
  /** A model or effort picker that takes the whole box while open, as on the phone. */
  panel?: ReactNode;
  /** The "/" menu gets each key first; true means it handled it. */
  onMenuKey?(event: React.KeyboardEvent): boolean;
  onChange(value: string): void; onSubmit(): void; onStop(): void; onCommands(): void;
  onFocus(): void; onSelect(start: number, end: number): void;
}) {
  // Grow with the draft up to a comfortable height, then scroll inside.
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
  }, [draft, input, panel]);
  const command = draft.trimStart().startsWith('/');
  const stop = working && !command;
  if (panel) return <div className="chat-composer has-panel">{panel}</div>;
  return <form className={`chat-composer ${working ? 'is-working' : ''}`} onSubmit={event => { event.preventDefault(); onSubmit(); }}
    onMouseDown={event => { if (event.target === event.currentTarget) { event.preventDefault(); input.current?.focus(); } }}>
    <textarea ref={input} aria-label={`Message ${agentName}`} rows={1} value={draft} disabled={busy}
      placeholder={working ? `Message ${agentName} while it works…` : `Ask ${agentName} anything, or type / for commands`}
      onSelect={event => onSelect(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
      onFocus={onFocus} onChange={event => onChange(event.target.value)}
      onKeyDown={event => { if (onMenuKey?.(event)) { event.preventDefault(); return; } if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSubmit(); } }} />
    <div className="chat-composer__bar">
      <div className="chat-composer__left">{attach}{settings}{extra}</div>
      <div className="chat-composer__right">
        <button type="button" className="chat-round" aria-label="Open commands" title="Commands  /" onClick={onCommands}><ChatSlashIcon size={15} /></button>
        {voice}
        {stop ? <button type="button" className="chat-send is-stop" aria-label="Stop AI reply" title="Stop" disabled={!canStop} onClick={onStop}><span className="chat-send__stop" /></button>
          : <button type="submit" className="chat-send" aria-label="Send message" title="Send  ↵" disabled={!canSend}>{busy ? <span className="chat-spinner chat-spinner--light" /> : <ChatArrowUpIcon size={17} />}</button>}
      </div>
    </div>
  </form>;
}
