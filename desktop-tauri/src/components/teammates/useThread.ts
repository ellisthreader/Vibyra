import { computerName } from "../../lib/platform";
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { teammateApi, message } from './api';
import { confirmedTurn, restoreThread, saveThread, type Attachment, type Pending, type ThreadDraft } from './threadStorage';
import { submitThread } from './threadRequests';
import { useThreadHistory } from './useThreadHistory';
import type { Quote, Teammate } from './types';

export function useThread(agent: Teammate, identity: string, active: boolean, enabled = true) {
  const key = `teammate-chat.${encodeURIComponent(identity)}.${agent.chatId}`;
  const [state, setState] = useState<ThreadDraft>(() => { try { return restoreThread(localStorage.getItem(key)); } catch { return restoreThread('invalid'); } });
  const history = useThreadHistory(agent.chatId, active), { ready, loadError, refresh } = history;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [resourceError, setResourceError] = useState('');
  const [resourceVersion, setResourceVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [consented, setConsented] = useState<boolean | null>(null);
  const [models, setModels] = useState<{ id: string; name: string; available: boolean; reasoning?: { efforts: string[] } }[]>([]);
  const lock = useRef(false), alive = useRef(true), version = useRef(0);
  const latest = useRef(state); latest.current = state;
  const writable = useRef(false); writable.current = active && enabled && !agent.archived && !state.recoveryError;
  const update = (patch: Partial<ThreadDraft>) => {
    const next = { ...latest.current, ...patch }; saveThread(key, next);
    latest.current = next; if (alive.current) setState(next);
  };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { version.current++; setQuote(null); }, [agent.revision]);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    setResourceError('');
    void teammateApi<{ wallet: { consented: boolean } }>('vibes/wallet').then(d => { if (!stopped) setConsented(d.wallet.consented === true); }).catch(e => { if (!stopped) setResourceError(message(e)); });
    void teammateApi<{ models: typeof models }>('vibes/models').then(d => { if (!stopped) setModels(d.models); }).catch(e => { if (!stopped) setResourceError(message(e)); });
    return () => { stopped = true; };
  }, [active, resourceVersion]);
  const change = (patch: Partial<ThreadDraft>) => {
    if (lock.current || state.pending || state.recoveryError) return;
    version.current++; setQuote(null);
    try { update(patch); } catch { setError(`Your draft could not be saved on this ${computerName}.`); }
  };
  const run = async (task: () => Promise<void>) => {
    if (lock.current || !alive.current || !active) return;
    lock.current = true; setBusy(true); setError('');
    try { await task(); } catch (e) { if (alive.current) setError(message(e)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const guard = () => { if (!writable.current || !ready || loadError || !consented || latest.current.pending) throw new Error('Refresh this conversation before sending.'); };
  const estimate = () => run(async () => {
    guard(); const requested = version.current, draft = latest.current;
    if (!draft.draft.trim()) return;
    const result = await teammateApi<Quote>('vibes/quote', { chatId: agent.chatId, text: draft.draft, model: draft.model,
      ...(draft.effort ? { effort: draft.effort } : {}), attachments: draft.attachments.map(a => a.id) });
    if (alive.current && requested === version.current) setQuote(result);
  });
  const accept = () => run(async () => { if (!writable.current) return; await teammateApi('vibes/consent', { accepted: true }); if (alive.current) setConsented(true); });
  const complete = async () => { update({ draft: '', pending: null, attachments: [] }); await refresh(); };
  const submit = async (request: Pending) => {
    await submitThread(teammateApi, agent.chatId, request, () => update({ draft: request.text, pending: null }));
    await complete();
  };
  const send = () => run(async () => {
    guard();
    if (!quote || quote.expiresAt * 1000 <= Date.now()) { setQuote(null); throw new Error('The estimate expired. Get a fresh estimate.'); }
    const request = { id: crypto.randomUUID(), quote: quote.quote, text: latest.current.draft };
    update({ pending: request }); setQuote(null); await submit(request);
  });
  const reconcile = () => run(async () => {
    const pending = latest.current.pending; if (!pending) return;
    try { confirmedTurn(await teammateApi(`vibes/turns/${pending.id}`), agent.chatId, pending); }
    catch (e) { if (!message(e).startsWith('404:')) throw e; throw new Error('This send is not confirmed. Retry the original request to check it safely.'); }
    await complete();
  });
  const retry = () => run(async () => { if (writable.current && latest.current.pending) await submit(latest.current.pending); });
  const attach = (file: File) => run(async () => {
    guard(); const draft = latest.current;
    if (file.size > 2 * 1024 * 1024) throw new Error('Attach a file under 2 MB.');
    if (draft.attachments.length >= 4) throw new Error('Attach up to four files.');
    const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    if (!alive.current || !writable.current) return;
    const result = await invoke<{ attachment: Attachment }>('teammate_upload', { name: file.name, mime: file.type || 'application/octet-stream', data: btoa(binary) });
    if (!alive.current) return;
    version.current++; setQuote(null); update({ attachments: [...draft.attachments, result.attachment] });
  });
  const stop = (id: string) => run(async () => { await teammateApi(`vibes/turns/${id}/cancel`, {}); await refresh(); });
  return { ...state, attach, removeAttachment: (id: string) => change({ attachments: state.attachments.filter(a => a.id !== id) }),
    edit: (draft: string) => change({ draft }), ...history, quote, error: state.recoveryError || error || loadError || resourceError, loadError, resourceError, busy, ready, consented, models,
    setEffort: (effort: string) => change({ effort }), setModel: (model: string) => change({ model, effort: '' }),
    reload: async () => { setError(''); setResourceVersion(n => n + 1); await refresh(); }, dismissQuote: () => setQuote(null), refresh, estimate, accept, send, reconcile, retry, stop };
}
