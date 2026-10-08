import { useEffect, useRef, type ReactNode } from 'react';
import { ChatChevronIcon } from './chatIcons';

/**
 * One control in the composer's settings row: an icon, a short value and a
 * chevron. Its menu opens above it and closes on a click anywhere else.
 */
export function ChatChip({ icon, label, title, open, disabled, tone, onOpen, onDismiss, menu, align = 'start' }: {
  icon: ReactNode; label: string; title: string; open: boolean; disabled?: boolean; tone?: 'warn';
  onOpen(): void; onDismiss(): void; menu?: ReactNode; align?: 'start' | 'end';
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) onDismiss(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, onDismiss]);
  return <div ref={box} className={`chat-chip chat-chip--${align}`}>
    {open && menu}
    <button type="button" className={`chat-chip__button ${tone ? `is-${tone}` : ''}`} aria-haspopup="dialog" aria-expanded={open}
      disabled={disabled} title={title} aria-label={`${title}: ${label}`} onClick={onOpen}>
      <span className="chat-chip__icon">{icon}</span>
      <span className="chat-chip__label">{label}</span>
      <span className="chat-chip__chevron"><ChatChevronIcon size={10} /></span>
    </button>
  </div>;
}
