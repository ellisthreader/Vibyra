import { useEffect, useRef } from 'react';
/** Keep keyboard navigation inside the active dialog and return focus to its opener. */
export function useDialogFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLElement | null>(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!open || !ref.current) return;
    const root = ref.current, previous = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')).filter(el => el.getClientRects().length);
    controls()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = controls(), first = elements[0], last = elements.at(-1);
      if (!first) {event.preventDefault();return;}
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {event.preventDefault();first.focus();}
    };
    root.addEventListener('keydown',key);
    return () => {root.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
  }, [open]);
  return ref;
}
