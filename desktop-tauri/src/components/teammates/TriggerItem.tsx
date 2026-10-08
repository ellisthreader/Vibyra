import { useState } from 'react';
import { words, type RoutinesClient } from './routinesClient';
import { WebhookSteps } from './WebhookCard';
import { formatInstant, deviceTimezone } from '../../../../mobile/src/agents/v2/routinesModel.ts';
import {
  eventLabel, eventTitle, filterSummary, isWebhook, kindInfo, triggerStatus, type Trigger, type TriggerEvent,
} from '../../../../mobile/src/agents/v2/triggersModel.ts';

/** One saved trigger: its filter and instructions, status, pause, delete, setup and event history. */
export function TriggerItem({ trigger: t, client, disabled, onChanged, onOpenChat }: {
  trigger: Trigger; client: RoutinesClient; disabled: boolean; onChanged(next: Trigger | null): void; onOpenChat(): void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState(false);
  const [events, setEvents] = useState<TriggerEvent[] | null>(null), [open, setOpen] = useState(false);
  const [secret, setSecret] = useState(''), [savedSecret, setSavedSecret] = useState(false);
  const act = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); } catch (e) { setError(words(e)); } finally { setBusy(false); }
  };
  const name = kindInfo(t.kind)?.label ?? t.kind, status = triggerStatus(t), zone = deviceTimezone();
  const toggleHistory = () => { setOpen(!open); if (!open) void act(async () => setEvents(await client.events(t.id))); };
  return <div className="routine-item" role="group" aria-label={`Trigger: ${name}`}>
    <div className="routine-head">
      <span><strong>{name}</strong><small>{filterSummary(t)}</small></span>
      <span className="routine-state" data-tone={status.tone}>{status.label}</span>
    </div>
    <p className="routine-prompt">{t.promptTemplate}</p>
    {t.kind === 'stripe.event' && <div className="routine-row routine-fields routine-secret">
      <label>Signing secret<input type="password" autoComplete="off" placeholder="whsec_…" value={secret} disabled={disabled || busy}
        onChange={e => { setSecret(e.target.value); setSavedSecret(false); }} /></label>
      <button type="button" disabled={disabled || busy || !/^whsec_[A-Za-z0-9]{16,128}$/.test(secret.trim())}
        onClick={() => void act(async () => { onChanged(await client.saveSigningSecret(t, secret.trim())); setSecret(''); setSavedSecret(true); })}>Save secret</button>
      {savedSecret && <small role="status">Signing secret saved.</small>}
    </div>}
    <div className="routine-actions">
      <button type="button" disabled={disabled || busy} aria-label={`${t.paused ? 'Resume' : 'Pause'} trigger ${name}`}
        onClick={() => void act(async () => onChanged(await client.pauseTrigger(t.id, !t.paused)))}>{t.paused ? 'Resume' : 'Pause'}</button>
      <button type="button" aria-expanded={open} aria-label={`History for trigger ${name}`} onClick={toggleHistory}>History</button>
      <button type="button" disabled={disabled || busy} aria-label={`Delete trigger ${name}`} onClick={() => setConfirm(true)}>Delete</button>
    </div>
    {confirm && <div className="routine-confirm" role="alert">Delete this trigger? Its webhook stops working; past runs stay in the conversation.
      <button type="button" disabled={busy} onClick={() => void act(async () => { await client.deleteTrigger(t.id); onChanged(null); })}>Delete trigger</button>
      <button type="button" onClick={() => setConfirm(false)}>Keep</button></div>}
    {error && <p role="alert" className="routines-error">{error}</p>}
    {isWebhook(t.kind) && t.webhookUrl && <details className="webhook-details"><summary>Webhook setup</summary><WebhookSteps trigger={t} url={t.webhookUrl} /></details>}
    {open && <ul className="routine-history" aria-label="Recent events">
      {!events ? <li>Loading…</li> : !events.length ? <li>No events yet.</li> : events.map(e => {
        const { label, tone } = eventLabel(e);
        return <li key={e.id}><time dateTime={e.createdAt}>{formatInstant(e.createdAt, zone)}</time>
          <span className="routine-event">{eventTitle(e)}</span><span data-tone={tone}>{label}</span>
          {e.runId && <button type="button" onClick={onOpenChat} aria-label={`Open the run for ${eventTitle(e)} in chat`}>Open in chat</button>}</li>;
      })}
    </ul>}
  </div>;
}
