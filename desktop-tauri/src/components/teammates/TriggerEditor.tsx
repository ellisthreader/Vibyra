import { useEffect, useState } from 'react';
import { words, type RoutinesClient } from './routinesClient';
import { TriggerFields } from './TriggerFields';
import {
  TRIGGER_KINDS, kindInfo, newTriggerDraft, triggerBody, triggerProblem, type Connection, type Trigger, type TriggerDraft, type Webhook,
} from '../../../../mobile/src/agents/v2/triggersModel.ts';

/** A new "when something happens" trigger. Poll kinds need a connected account granted to this teammate. */
export function TriggerEditor({ agentId, client, kinds, disabled, initial, onCreated, onCancel }: {
  /** A starter's suggested trigger; nothing is saved until the person saves it. */ initial?: Partial<TriggerDraft>;
  agentId: string; client: RoutinesClient; kinds: string[]; disabled: boolean;
  onCreated(trigger: Trigger, webhook: Webhook | null): void; onCancel(): void;
}) {
  const offered = TRIGGER_KINDS.filter(k => kinds.includes(k.kind));
  const [draft, setDraft] = useState<TriggerDraft>(() => ({ ...newTriggerDraft(initial?.kind ?? offered[0]?.kind ?? 'github.issue'), ...initial }));
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const needsAccount = Boolean(kindInfo(draft.kind)?.provider);
  useEffect(() => {
    if (!needsAccount || connections) return;
    let live = true;
    client.connections().then(list => { if (live) setConnections(list); }).catch(e => { if (live) { setConnections([]); setError(words(e)); } });
    return () => { live = false; };
  }, [needsAccount, connections, client]);
  const update = (patch: Partial<TriggerDraft>) => { setDraft(d => ({ ...d, ...patch })); setError(''); };
  // Switching kind keeps a prompt the person wrote; an untouched default follows the kind.
  const choose = (kind: TriggerDraft['kind']) => setDraft(d => ({ ...newTriggerDraft(kind),
    promptTemplate: d.promptTemplate === kindInfo(d.kind)?.prompt ? kindInfo(kind)?.prompt ?? '' : d.promptTemplate, ratePerHour: d.ratePerHour }));
  const problem = triggerProblem(draft);
  const save = async () => {
    if (problem || busy) return;
    setBusy(true); setError('');
    try { const result = await client.createTrigger(triggerBody(agentId, draft)); onCreated(result.trigger, result.webhook); }
    catch (e) { setError(words(e)); } finally { setBusy(false); }
  };
  if (!offered.length) return <p className="profile-help">No trigger kinds are available for this account yet.</p>;
  return <div className="routine-editor" role="group" aria-label="New trigger">
    <div className="routine-segments routine-kinds" role="radiogroup" aria-label="When">{offered.map(k =>
      <button type="button" role="radio" key={k.kind} aria-checked={draft.kind === k.kind} disabled={disabled} onClick={() => choose(k.kind)}>{k.label}</button>)}</div>
    <TriggerFields draft={draft} update={update} connections={connections} disabled={disabled} />
    <label>What should it do?<textarea aria-label="Trigger instructions" maxLength={8000} value={draft.promptTemplate} disabled={disabled}
      onChange={e => update({ promptTemplate: e.target.value })} /></label>
    <p className="profile-help">The event’s details are added after your instructions as data, never as instructions. Tools still come only from this teammate’s access.</p>
    <div className="routine-row routine-fields">
      <label className="routine-cap">Hourly cap<input type="number" min={1} max={60} value={draft.ratePerHour} disabled={disabled}
        onChange={e => update({ ratePerHour: Number(e.target.value) })} /></label>
    </div>
    {(error || (problem && draft.promptTemplate.trim())) && <p role="alert" className="routines-error">{error || problem}</p>}
    <div className="routine-actions">
      <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className="primary" disabled={disabled || busy || Boolean(problem)} title={problem ?? undefined} onClick={() => void save()}>{busy ? 'Saving…' : 'Save trigger'}</button>
    </div>
  </div>;
}
