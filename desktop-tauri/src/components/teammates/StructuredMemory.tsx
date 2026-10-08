import { useCallback, useEffect, useRef, useState } from 'react';
import { teammateApi, message } from './api';
import { stageTwoClient, type MemoryAction, type MemoryFact, type MemoryPage } from '../../../../mobile/src/agents/v2/stageTwoModel.ts';
import '../../styles/teammate-memory.css';

const api = stageTwoClient(teammateApi);
/** Mutations use the account and revision actually displayed; errors require a fresh read. */
export function StructuredMemory({ agentId, identity, runtimeId, disabled }: { agentId: string; identity: string; runtimeId?: string; disabled: boolean }) {
  const [page, setPage] = useState<MemoryPage | null>(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [needsRefresh, setNeedsRefresh] = useState(false);
  const [draft, setDraft] = useState(''), [editing, setEditing] = useState<string | null>(null), [correction, setCorrection] = useState('');
  const generation = useRef(0), lock = useRef(false);
  const load = useCallback(async () => {
    const version = ++generation.current; lock.current = true; setBusy(true); setError(''); setPage(null);
    try { const next = await api.memories(agentId, runtimeId); if (runtimeId && next.runtimeId !== runtimeId) throw new Error('Memory returned a different account. Refresh before continuing.'); if (version === generation.current) { setPage(next); setNeedsRefresh(false); setEditing(null); } }
    catch (e) { if (version === generation.current) { setError(message(e)); setNeedsRefresh(true); } }
    finally { if (version === generation.current) { lock.current = false; setBusy(false); } }
  }, [agentId, identity, runtimeId]);
  useEffect(() => { void load(); return () => { generation.current++; lock.current = false; }; }, [load]);
  const mutate = async (item?: MemoryFact, action?: MemoryAction) => {
    if (lock.current || disabled || needsRefresh || !page) return;
    lock.current = true; setBusy(true); setError(''); const version = generation.current;
    try {
      if (item && action) await api.memory(agentId, page.runtimeId, page.accountScope, item, action, action === 'correct' ? correction.trim() : undefined);
      else await api.remember(agentId, page.runtimeId, page.accountScope, draft.trim());
      if (version !== generation.current) return;
      setDraft(''); setEditing(null); await load();
    } catch (e) { if (version === generation.current) { setError(`${message(e)} Refresh memory before making another change.`); setNeedsRefresh(true); } }
    finally { if (version === generation.current) { lock.current = false; setBusy(false); } }
  };
  const locked = disabled || busy || needsRefresh || !page;
  return <div className="structured-memory" aria-label="Reviewed teammate memory" aria-busy={busy}>
    <div className="structured-memory__heading"><h3>Reviewed memory</h3><button type="button" disabled={busy} onClick={() => void load()}>Refresh memory</button></div>
    <p className="profile-help">Save facts for this teammate and selected AI account. Say “Remember that…” in a task to suggest a memory for review. Changes here save immediately.</p>
    {page && <p className="structured-memory__account">{page.accountLabel}</p>}
    {error && <p role="alert">{error}</p>}
    {!page && !error && <p role="status">Loading memory…</p>}
    {page && <>
      <label>Add a fact<textarea aria-label="New memory fact" maxLength={1000} value={draft} disabled={locked}
        placeholder="A preference or useful fact…" onChange={e => setDraft(e.target.value)} /></label>
      <button type="button" disabled={locked || !draft.trim()} onClick={() => void mutate()}>Save memory</button>
      {!page.memories.length && <p className="profile-help">No reviewed or suggested memories yet.</p>}
      <ul className="structured-memory__list">{page.memories.map(item => <li key={item.id}>
        <div className="structured-memory__heading"><strong>{item.status === 'pending' ? 'Review suggestion' : item.status.charAt(0).toUpperCase() + item.status.slice(1)}</strong><small>{item.sourceKind === 'document' ? 'Document fact' : 'Your preference or fact'}</small></div>
        <p className="structured-memory__fact">{item.fact}</p><small>{item.sourceLabel} · {new Date(item.updatedAt).toLocaleDateString()}{item.expiresAt ? ` · Expires ${new Date(item.expiresAt).toLocaleDateString()}` : ''}</small>
        {editing === item.id ? <div><label>Correct this memory<textarea aria-label="Corrected memory fact" disabled={locked} value={correction} maxLength={1000} onChange={e => setCorrection(e.target.value)} /></label>
          <button type="button" disabled={locked || !correction.trim()} onClick={() => void mutate(item, 'correct')}>Save correction</button>
          <button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel correction</button></div>
          : <div className="structured-memory__actions">
            {item.status === 'pending' && <button type="button" disabled={locked} onClick={() => void mutate(item, 'accept')}>Accept memory</button>}
            {item.status === 'active' && <button type="button" disabled={locked} onClick={() => void mutate(item, 'undo')}>Undo</button>}
            <button type="button" disabled={locked} onClick={() => { setEditing(item.id); setCorrection(item.fact); }}>Correct</button>
            <button type="button" disabled={locked} onClick={() => void mutate(item, 'forget')}>Forget</button>
          </div>}
      </li>)}</ul>
    </>}
  </div>;
}
