import { useRef, useState } from 'react';
import { useConnectors } from '../settings/useConnectors';
import { message } from './api';
import { accessHint, hintCopy } from './serviceHints';
import { allowService } from './teammateSave';
import type { Teammate } from './types';

/** A quiet row above the composer when the draft is about a service this
 * teammate cannot use yet. It only changes access; it never sends the message
 * and never blocks the composer. The catalogue loads once a draft exists. */
export function AccessHint({ agent, draft, active, onSaved, onReload }: { agent: Teammate; draft: string; active: boolean; onSaved(agent: Teammate): void; onReload(): void }) {
  if (!active || agent.archived || !draft.trim()) return null;
  return <Hint agent={agent} draft={draft} onSaved={onSaved} onReload={onReload} />;
}

function Hint({ agent, draft, onSaved, onReload }: { agent: Teammate; draft: string; onSaved(agent: Teammate): void; onReload(): void }) {
  const { identity, catalogue, error: connectError, busyId, pendingId, connect, cancel, refresh } = useConnectors();
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const hint = identity && catalogue?.enabled ? accessHint(draft, agent.integrations, catalogue.integrations) : null;
  if (!hint) return null;
  const { text, action } = hintCopy[hint.kind](hint.item.name);
  const shown = error || connectError;
  const busy = saving || busyId !== null;
  const allow = async () => {
    if (lock.current) return; lock.current = true; setSaving(true); setError('');
    try { onSaved(await allowService(agent, hint.item.id)); }
    catch (e) {
      const detail = message(e); setError(detail);
      // Someone else saved this teammate first: reload it, then the hint reads the newer grants.
      if (/^409:/.test(detail)) { onReload(); setError('This teammate changed, so it was reloaded. Try again.'); }
    } finally { lock.current = false; setSaving(false); }
  };
  return <div className={`teammate-notice${shown ? ' error' : ''}`} role="status" aria-label="Service access">
    <span>{pendingId === hint.item.id ? `Finish connecting ${hint.item.name} in your browser.` : text}</span>
    {pendingId === hint.item.id ? <><button type="button" onClick={() => void refresh()}>Check now</button><button type="button" onClick={cancel}>Cancel</button></>
      : <button type="button" disabled={busy} onClick={() => hint.kind === 'allow' ? void allow() : void connect(hint.item.id)}>{saving ? 'Saving…' : action}</button>}
    {shown && <span role="alert">{shown}</span>}
  </div>;
}
