import { useRef, useState } from 'react';
import { teammateApi, message } from './api';
import type { Tool, Turn } from './types';
export function Decision({ tool, turn, enabled, refresh }: { tool: Tool; turn: Turn; enabled: boolean; refresh(): Promise<void> }) {
  const lock = useRef(false); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [unknown, setUnknown] = useState(false);
  const available = (t: Tool, run: Turn) => run.status === 'waiting' && t.approval?.state === 'pending' && !t.approval.answer && t.expiresAt * 1000 > Date.now();
  const decide = async (decision: 'allow' | 'decline') => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try {
      const latest = (await teammateApi<{ turn: Turn }>(`vibes/turns/${turn.id}`)).turn;
      const current = latest.tools?.find(t => t.id === tool.id);
      if (!current?.approval || !available(current, latest) || current.approval?.fingerprint !== tool.approval?.fingerprint) { await refresh(); throw new Error('This action changed or expired. Review the current details before deciding.'); }
      setUnknown(true);
      await teammateApi(`agents/v1/decisions/${tool.id}`, { fingerprint: current.approval.fingerprint, decision });
      await refresh(); setUnknown(false);
    } catch (e) { setError(message(e)); } finally { lock.current = false; setBusy(false); }
  };
  return <article className="teammate-decision"><small>{tool.integration} · {tool.operation.replaceAll('_', ' ')}</small><pre>{JSON.stringify(tool.approval?.arguments, null, 2)}</pre>
    {available(tool, turn) ? <div className="teammate-decision-actions"><button disabled={!enabled || busy || unknown} onClick={() => void decide('decline')}>Deny</button><button className="primary" disabled={!enabled || busy || unknown} onClick={() => void decide('allow')}>Approve once</button></div> : <p>{({ queued: 'Approved · waiting to run', dispatching: 'Running action', completed: 'Action completed', declined: 'Declined', expired: 'Expired', unknown: 'Outcome unconfirmed' } as Record<string,string>)[tool.approval?.state ?? ''] ?? (tool.expiresAt * 1000 <= Date.now() ? 'Expired' : 'Checking action status')}</p>}
    {error && <p role="alert">{error}</p>}{unknown && <button disabled={busy} onClick={() => void refresh().then(() => { setUnknown(false); setError(''); }).catch(e => setError(message(e)))}>Refresh decision</button>}
  </article>;
}
