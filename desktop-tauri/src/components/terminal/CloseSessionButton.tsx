import { useEffect, useRef, useState } from 'react';
import { CloseIcon } from '../common/Icons';
import './closeSessionButton.css';

/** A second deliberate click closes; leaving the control cancels the arm. */
export function CloseSessionButton({ onClose, disabled = false, active = true }: {
  onClose: () => Promise<unknown>; disabled?: boolean; active?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [closing, setClosing] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    if (!active || disabled) setArmed(false);
  }, [active, disabled]);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  const click = async () => {
    if (pending.current || disabled || !active) return;
    if (!armed) { setArmed(true); return; }
    pending.current = true; setClosing(true); setArmed(false);
    try { await onClose(); }
    finally { pending.current = false; setClosing(false); }
  };
  return <button type="button" className={`icon-btn session-close ${armed ? 'session-close--armed' : ''}`}
    aria-label={armed ? 'Close terminal now' : 'Close terminal'}
    title={armed ? 'Click again to close' : 'Close terminal'}
    disabled={disabled || closing} onClick={() => void click()}
    onBlur={() => setArmed(false)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setArmed(false); } }}>
    <CloseIcon size={14} />
  </button>;
}
