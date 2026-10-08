import { useEffect, useRef, useState } from 'react';
import { confirmedSteeringRefusal, instructionState, type StageTwoApi, type SteeredRun } from './stageTwoModel';

type Pending = { idempotencyKey: string; expectedRevision: number; text: string };

export function useSteering(api: StageTwoApi, runId: string, active: boolean, uuid: () => string, refresh: () => Promise<void>, accountScope = '') {
  const [run, setRun] = useState<SteeredRun | null>(null), [text, setText] = useState('');
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), epoch = useRef(0), pending = useRef<Pending | null>(null);
  const scope = `${accountScope}\u0000${runId}`, currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    ++epoch.current; pending.current = null; lock.current = false;
    setRun(null); setText(''); setOpen(false); setBusy(false); setError('');
    const scopeEpoch = epoch;
    return () => { ++scopeEpoch.current; };
  }, [scope, api]);
  useEffect(() => {
    if (!open) return;
    let stopped = false; const version = epoch.current;
    const load = () => api.run(runId).then(value => {
      if (!stopped && epoch.current === version && currentScope.current === scope && value.id === runId) setRun(value);
    }).catch(e => { if (!stopped && currentScope.current === scope) setError(String(e.message ?? e)); });
    void load(); const timer = setInterval(() => void load(), 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [api, runId, open, scope]);
  const send = async () => {
    if (lock.current || !active || run?.id !== runId || (!pending.current && (run.terminal || !text.trim()))) return;
    lock.current = true; setBusy(true); setError(''); const version = epoch.current;
    const valid = () => version === epoch.current && currentScope.current === scope;
    pending.current ??= { idempotencyKey: uuid(), expectedRevision: run.instructionRevision ?? 0, text: text.trim() };
    try {
      const value = await api.steer(runId, pending.current);
      if (!valid()) return;
      if (value.id !== runId) throw new Error('The service returned a different task. Refresh this task.');
      setRun(value); pending.current = null; setText('');
      // The update is already accepted; a separate history refresh failure must not imply it needs resending.
      try { await refresh(); } catch { /* polling refreshes this exact task */ }
    } catch (e) {
      if (!valid()) return;
      // A confirmed refusal releases the draft; transport loss retains the identical key/body.
      if (confirmedSteeringRefusal(e)) pending.current = null;
      setError(e instanceof Error ? e.message : 'Check this correction before sending another.');
    } finally { if (valid()) { lock.current = false; setBusy(false); } }
  };
  return { run, text, setText, open, setOpen, busy, error, send, uncertain: Boolean(pending.current),
    waiting: Boolean(run && instructionState(run) === 'waiting') };
}
