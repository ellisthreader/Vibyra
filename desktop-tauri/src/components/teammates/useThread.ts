import { computerName } from "../../lib/platform";
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { teammateApi, message } from './api';
import type { Quote, Teammate, Turn } from './types';
interface Attachment { id: string; name: string; bytes: number }
interface Pending { id: string; quote: string; text: string }
export function useThread(agent: Teammate, identity: string, active: boolean) {
  const key = `teammate-chat.${encodeURIComponent(identity)}.${agent.chatId}`;
  const read = () => { try { const value = JSON.parse(localStorage.getItem(key) ?? '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } };
  const [draft, setDraft] = useState<string>(() => typeof read().draft === 'string' ? read().draft : '');
  const [attachments, setAttachments] = useState<Attachment[]>(() => Array.isArray(read().attachments) ? read().attachments.filter((a: Attachment) => a && typeof a.id === 'string' && typeof a.name === 'string') : []);
  const [pending, setPending] = useState<Pending | null>(() => { const p = read().pending; return p && typeof p.id === 'string' && typeof p.quote === 'string' && typeof p.text === 'string' ? p : null; });
  const [turns, setTurns] = useState<Turn[]>([]), [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [consented, setConsented] = useState(false), [model, setModel] = useState('auto');
  const [effort, setEffort] = useState(''), [models, setModels] = useState<{ id: string; name: string; available: boolean; reasoning?: { efforts: string[] } }[]>([]);
  const lock = useRef(false), alive = useRef(true), version = useRef(0);
  const persist = (text: string, request: Pending | null) => localStorage.setItem(key, JSON.stringify({ draft: text, pending: request, attachments: text || request ? attachments : [] }));
  const refresh = useCallback(async () => {
    const data = await teammateApi<{ turns: Turn[] }>(`vibes/chats/${agent.chatId}/turns`);
    if (alive.current) { setTurns(data.turns); setReady(true); }
  }, [agent.chatId]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!active) return; let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { try { await refresh(); } catch (e) { if (!stopped) setError(message(e)); } if (!stopped) timer = setTimeout(poll, 5000); };
    void poll();
    void teammateApi<{ wallet: { consented: boolean } }>('vibes/wallet').then(d => { if (!stopped) setConsented(d.wallet.consented); }).catch(e => { if (!stopped) setError(message(e)); });
    void teammateApi<{ models: typeof models }>('vibes/models').then(d => { if (!stopped) setModels(d.models); }).catch(e => { if (!stopped) setError(message(e)); });
    return () => { stopped = true; clearTimeout(timer); };
  }, [active, refresh]);
  const edit = (text: string) => { version.current++; setDraft(text); setQuote(null); try { persist(text, pending); } catch { setError(`Your draft could not be saved on this ${computerName}.`); } };
  const run = async (task: () => Promise<void>) => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await task(); } catch (e) { if (alive.current) setError(message(e)); } finally { lock.current = false; if (alive.current) setBusy(false); } };
  const estimate = () => run(async () => { const requested = version.current; const result = await teammateApi<Quote>('vibes/quote', { chatId: agent.chatId, text: draft, model, ...(effort ? {effort} : {}), attachments: attachments.map(a => a.id) }); if (alive.current && requested === version.current) setQuote(result); });
  const accept = () => run(async () => { await teammateApi('vibes/consent', { accepted: true }); if (alive.current) setConsented(true); });
  const submit = async (request: Pending) => {
    try { await teammateApi('vibes/turns', { id: request.id, quote: request.quote }); }
    catch (e) {
      if (/^(400|403|404|409|422):/.test(message(e))) {
        try { await teammateApi(`vibes/turns/${request.id}`); }
        catch (lookup) {
          if (message(lookup).startsWith('404:')) { persist(request.text, null); setPending(null); setDraft(request.text); }
          throw e;
        }
      } else throw e;
    }
    persist('', null); if (alive.current) { setPending(null); setDraft(''); setAttachments([]); await refresh(); }
  };
  const send = () => run(async () => {
    if (!quote || quote.expiresAt * 1000 <= Date.now()) { setQuote(null); throw new Error('The estimate expired. Get a fresh estimate.'); }
    const request = { id: crypto.randomUUID(), quote: quote.quote, text: draft };
    persist(draft, request); setPending(request); setQuote(null);
    await submit(request);
  });
  const reconcile = () => run(async () => {
    if (!pending) return;
    try { await teammateApi(`vibes/turns/${pending.id}`); persist('', null); setPending(null); setDraft(''); setAttachments([]); await refresh(); }
    catch (e) { if (!message(e).startsWith('404:')) throw e; throw new Error('This send is not confirmed. Retry the original request; do not send a new copy.'); }
  });
  const retry = () => run(async () => {
    if (!pending) return;
    await submit(pending);
  });
  const attach = (file: File) => run(async () => {
    if (file.size > 2 * 1024 * 1024) throw new Error('Attach a file under 2 MB.');
    if (attachments.length >= 4) throw new Error('Attach up to four files.');
    const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const result = await invoke<{ attachment: Attachment }>('teammate_upload', { name: file.name, mime: file.type || 'application/octet-stream', data: btoa(binary) });
    if (!alive.current) return;
    const next = [...attachments, result.attachment]; version.current++; setQuote(null); setAttachments(next);
    localStorage.setItem(key, JSON.stringify({ draft, pending, attachments: next }));
  });
  const removeAttachment = (id: string) => { const next = attachments.filter(a => a.id !== id); version.current++; setQuote(null); setAttachments(next); try { localStorage.setItem(key, JSON.stringify({ draft, pending, attachments: next })); } catch { setError('Your draft could not be saved.'); } };
  const stop = (id: string) => run(async () => { await teammateApi(`vibes/turns/${id}/cancel`, {}); await refresh(); });
  return { attachments, attach, removeAttachment, draft, edit, turns, quote, error, busy, ready, consented, models, effort, setEffort:(value:string)=>{version.current++;setEffort(value);setQuote(null);}, model, setModel: (id: string) => { version.current++; setModel(id); setEffort(''); setQuote(null); }, pending, refresh, estimate, accept, send, reconcile, retry, stop };
}
