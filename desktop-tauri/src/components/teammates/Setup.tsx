import { computerName } from "../../lib/platform";
import { useDialogFocus } from './useDialogFocus';
import { ToolGrants } from './ToolGrants';
import { useRef, useState } from 'react';
import { avatarUrl, message, teammateApi } from './api';
import type { Teammate } from './types';
export function Setup({ agent, identity, enabled, onClose, onSaved }: { agent?: Teammate; identity: string; enabled: boolean; onClose(): void; onSaved(agent: Teammate): void }) {
  const dialog = useDialogFocus(true, onClose);
  const storage = `teammate-setup.${encodeURIComponent(identity)}.${agent?.id ?? 'new'}`;
  const restore = () => { try { const value=JSON.parse(localStorage.getItem(storage) ?? '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; } };
  const [fields, setFields] = useState(() => restore().fields ?? { name: agent?.name ?? '', brief: agent?.brief ?? '', memory: agent?.memory ?? '', budget: agent?.budget ?? 10, avatar: agent?.avatar ?? 'sprout', integrations: agent?.integrations ?? [] });
  const [pending, setPending] = useState<Record<string, unknown> | null>(() => restore().pending ?? null);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const update = (key: string, value: unknown) => { const next = { ...fields, [key]: value }; setFields(next); try { localStorage.setItem(storage, JSON.stringify({ fields: next, pending })); } catch { setError(`Setup could not be saved on this ${computerName}.`); } };
  const save = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try {
      const body = pending ?? { ...fields, ...(agent ? { revision: agent.revision } : { id: crypto.randomUUID() }) };
      localStorage.setItem(storage, JSON.stringify({ fields, pending: body })); setPending(body);
      const result = await teammateApi<{ teammate: Teammate }>(`agents/v1/teammates${agent ? '/' + agent.id : ''}`, body);
      localStorage.removeItem(storage); onSaved(result.teammate);
    } catch (e) { const detail = message(e); if (/^(400|403|404|409|422):/.test(detail)) { setPending(null); localStorage.setItem(storage, JSON.stringify({ fields, pending: null })); } setError(detail); } finally { lock.current = false; setBusy(false); }
  };
  const archive = async () => { if (!agent || lock.current) return; lock.current = true; setBusy(true); try { const result = await teammateApi<{ teammate: Teammate }>(`agents/v1/teammates/${agent.id}/archive`, { revision: agent.revision, archived: !agent.archived }); onSaved(result.teammate); } catch(e) { setError(message(e)); } finally { lock.current = false; setBusy(false); } };
  return <div className="focus-dialog-backdrop"><form className="focus-dialog teammate-setup" ref={node => { dialog.current = node; }} role="dialog" aria-modal="true" aria-label={agent ? 'Teammate details' : 'New teammate'} onSubmit={e => { e.preventDefault(); void save(); }}>
    <header><h2>{agent ? 'Teammate details' : 'New teammate'}</h2><button type="button" onClick={onClose}>Done</button></header>
    <fieldset disabled={busy || Boolean(pending)}><label>Name<input required maxLength={80} value={fields.name} onChange={e => update('name', e.target.value)} /></label>
      <label>Task<textarea required maxLength={4000} value={fields.brief} onChange={e => update('brief', e.target.value)} /></label>
      <div className="teammate-avatars">{['oncall','lead','review','bugs','assistant','db','site','qa','sprout'].map(avatar => <button type="button" key={avatar} aria-label={`Choose ${avatar} avatar`} aria-pressed={fields.avatar === avatar} onClick={() => update('avatar', avatar)}><img src={avatarUrl(avatar)} alt="" /></button>)}</div>
      <label>Memory<textarea maxLength={4000} value={fields.memory} onChange={e => update('memory', e.target.value)} /></label>
      <label>Task budget<input type="number" min={1} max={50} required value={fields.budget} onChange={e => update('budget', Number(e.target.value))} /></label>
      <ToolGrants selected={fields.integrations} onChange={ids => update('integrations', ids)} />
    </fieldset>
    {error && <p role="alert">{error}</p>}{pending && <p>The exact save is retained until confirmed. Retry to reconcile it.</p>}
    <button className="primary" disabled={busy || !enabled || agent?.archived}>{pending ? 'Retry saved request' : 'Save teammate'}</button>
    {agent && <button type="button" disabled={busy || Boolean(pending)} onClick={() => void archive()}>{agent.archived ? 'Restore teammate' : 'Archive teammate'}</button>}
  </form></div>;
}
