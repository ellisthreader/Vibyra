import {stageFiveClient} from '../../../../mobile/src/agents/v2/stageFiveClient';
import {useAgentJobs} from '../../../../mobile/src/agents/v2/useAgentJobs';
import {checkQueue} from '../../../../mobile/src/agents/v2/jobsModel';
import { observeRuntimeChoice } from '../../../../mobile/src/agents/v2/cloudPreviewScope';
import { useAgentRuntime } from './useAgentRuntime';
import { computerName } from "../../lib/platform";
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { teammateApi, message } from './api';
import { confirmedTurn, restoreThread, saveThread, type Attachment, type Pending, type ThreadDraft } from './threadStorage';
import { submitThread } from './threadRequests';
import { useThreadHistory } from './useThreadHistory';
import { useRunHistory } from './useRunHistory';
import { useTaskPlan } from './useTaskPlan';
import { fixOf, type BridgeFix } from './bridgeError';
import { parseUpload, uploadProblem } from '../../../../mobile/src/agents/v2/overviewModel.ts';
import { isRunPending, mergeTurns, runPending, runTurn, submitRunPending } from './runsV2';
import type { Quote, Teammate, Turn } from './types';

const stageFive=stageFiveClient(teammateApi);
/** `v2`: sends become Agent v2 runs; earlier v1 turns stay readable in the same transcript. */
export function useThread(agent: Teammate, identity: string, active: boolean, enabled = true, v2 = false) {
  const jobs=useAgentJobs(v2?stageFive.jobs:undefined,agent.id,active&&v2),parallelJobs=v2&&jobs.page?.enabled===true;
  const runtime = useAgentRuntime(identity, agent.id, v2 && active);
  const key = `teammate-chat.${encodeURIComponent(identity)}.${agent.chatId}`;
  const [state, setState] = useState<ThreadDraft>(() => { try { return restoreThread(localStorage.getItem(key)); } catch { return restoreThread('invalid'); } });
  const legacy = useThreadHistory(agent.chatId, active), runs = useRunHistory(agent, active && v2);
  const refreshBoth = useCallback(async () => { await Promise.all([legacy.refresh(), runs.refresh()]); }, [legacy.refresh, runs.refresh]);
  const [accepted,setAccepted]=useState<Turn[]>([]);
  useEffect(()=>setAccepted(rows=>rows.filter(r=>!runs.turns.some(t=>t.id===r.id))),[runs.turns]);
  const merged = useMemo(() => mergeTurns(mergeTurns(legacy.turns,runs.turns),accepted.filter(r=>!runs.turns.some(t=>t.id===r.id))), [legacy.turns, runs.turns,accepted]);
  const history = v2 ? { ...legacy, turns: merged, ready: legacy.ready && runs.ready, loadError: legacy.loadError || runs.loadError, refresh: refreshBoth } : legacy;
  const { ready, loadError, refresh } = history;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [resourceError, setResourceError] = useState('');
  const [resourceVersion, setResourceVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const plan = useTaskPlan();
  useEffect(() => observeRuntimeChoice(runtime.store, () => { setQuote(null); plan.clear(); }), [runtime.store]); // eslint-disable-line react-hooks/exhaustive-deps
  // A refusal's own suggested step (choose an AI account, update Vibyra), kept beside its words.
  const [refusal, setRefusal] = useState<BridgeFix | null>(null);
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
  useEffect(() => { version.current++; setQuote(null); plan.clear(); }, [agent.revision]);
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
    version.current++; setQuote(null); plan.clear();
    try { update(patch); } catch { setError(`Your draft could not be saved on this ${computerName}.`); }
  };
  const run = async (task: () => Promise<void>) => {
    if (lock.current || !alive.current || !active) return;
    lock.current = true; setBusy(true); setError(''); setRefusal(null);
    try { await task(); } catch (e) { if (alive.current) { setError(message(e)); setRefusal(fixOf(e)); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const guard = () => { if (!writable.current || !ready || loadError || !consented || latest.current.pending || (!parallelJobs && history.turns.some(t=>['queued','running','waiting'].includes(t.status)))) throw new Error('Refresh this conversation before sending.'); };
  const estimate = () => run(async () => {
    guard(); const requested = version.current, draft = latest.current;
    if (!draft.draft.trim()) return;
    if (v2) {
      setQuote({ quote: '', model: 'v2', maxCredits: 0, estimatedCredits: 0, expiresAt: Date.now() / 1000 + 600 });
      // What the task could use is a preview beside Send, never a gate on it.
      plan.load({ agentId: agent.id, prompt: draft.draft, attachments: draft.attachments.map(a => a.id), runtimeId: runtime.store.runtimeId() }); return;
    }
    const result = await teammateApi<Quote>('vibes/quote', { chatId: agent.chatId, text: draft.draft, model: draft.model,
      ...(draft.effort ? { effort: draft.effort } : {}), attachments: draft.attachments.map(a => a.id) });
    if (alive.current && requested === version.current) setQuote(result);
  });
  const accept = () => run(async () => { if (!writable.current) return; await teammateApi('vibes/consent', { accepted: true }); if (alive.current) setConsented(true); });
  const complete = (turn?:Turn) => { if(turn?.v2)setAccepted(rows=>[...rows.filter(r=>r.id!==turn.id),turn]); update({ draft: '', pending: null, attachments: [] }); void refresh().catch(()=>{}); };
  const submit = async (request: Pending) => {
    const turn=isRunPending(request)?runTurn(await submitRunPending(teammateApi, request, () => update({ draft: request.text, pending: null }))):await submitThread(teammateApi, agent.chatId, request, () => update({ draft: request.text, pending: null }));
    complete(turn);
  };
  const send = () => run(async () => {
    guard();
    if(parallelJobs)checkQueue(await stageFive.jobs.list(agent.id));
    if (!parallelJobs && (!quote || quote.expiresAt * 1000 <= Date.now())) { setQuote(null); throw new Error('The estimate expired. Get a fresh estimate.'); }
    const request = v2 ? runPending(agent.id, latest.current.draft, undefined, latest.current.attachments.map(a => a.id), runtime.store.runtimeId(),parallelJobs?'independent':undefined) : { id: crypto.randomUUID(), quote: quote!.quote, text: latest.current.draft };
    update({ pending: request }); setQuote(null); plan.clear(); await submit(request);
  });
  const reconcile = () => run(async () => {
    const pending = latest.current.pending; if (!pending) return;
    // A v2 send is checked by replaying its identical key and body: the server returns the admitted run.
    if (isRunPending(pending)) { await submit(pending); return; }
    try { confirmedTurn(await teammateApi(`vibes/turns/${pending.id}`), agent.chatId, pending); }
    catch (e) { if (!message(e).startsWith('404:')) throw e; throw new Error('This send is not confirmed. Retry the original request to check it safely.'); }
    await complete();
  });
  const retry = () => run(async () => { if (writable.current && latest.current.pending) await submit(latest.current.pending); });
  const attach = (file: File) => run(async () => {
    guard(); const draft = latest.current;
    if (file.size > 2 * 1024 * 1024) throw new Error('Attach a file under 2 MB.');
    const unsuitable = v2 ? uploadProblem(file.name, file.type, file.size) : null;
    if (unsuitable) throw new Error(unsuitable);
    if (draft.attachments.length >= 4) throw new Error('Attach up to four files.');
    const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    if (!alive.current || !writable.current) return;
    const result = await invoke<{ attachment: Attachment }>('teammate_upload', { name: file.name, mime: file.type || 'application/octet-stream', data: btoa(binary), agentV2: v2 });
    if (!alive.current) return;
    // v2 answers with the run attachment's metadata (`size`); the chip keeps the same {id, name, bytes} either way.
    const uploaded = v2 ? parseUpload(result) : null;
    if (v2 && !uploaded) throw new Error('The service returned an invalid attachment. Try again.');
    const attachment: Attachment = uploaded ? { id: uploaded.id, name: uploaded.name, bytes: uploaded.bytes } : result.attachment;
    version.current++; setQuote(null); plan.clear(); update({ attachments: [...draft.attachments, attachment] });
  });
  const stop = (id: string) => run(async () => {
    await teammateApi(history.turns.find(t => t.id === id)?.v2 ? `agents/v2/runs/${id}/cancel` : `vibes/turns/${id}/cancel`, {}); await refresh();
  });
  return { ...state, runtime, jobs, parallelJobs, v2, plan, refusal, attach, removeAttachment: (id: string) => change({ attachments: state.attachments.filter(a => a.id !== id) }),
    edit: (draft: string) => change({ draft }), ...history, quote, error: state.recoveryError || error || loadError || resourceError, loadError, resourceError, busy, ready, consented, models,
    setEffort: (effort: string) => change({ effort }), setModel: (model: string) => change({ model, effort: '' }),
    reload: async () => { setError(''); setResourceVersion(n => n + 1); await refresh(); }, dismissQuote: () => { setQuote(null); plan.clear(); }, refresh, estimate, accept, send, reconcile, retry, stop };
}
