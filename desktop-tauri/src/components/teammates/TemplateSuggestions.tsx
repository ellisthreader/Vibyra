import { useEffect, useMemo, useState } from 'react';
import { markId } from '../../../../mobile/src/agents/v2/providerLabels.ts';
import { operationsLine, recurrenceWords, triggerWords, type Template } from '../../../../mobile/src/agents/v2/templatesModel.ts';
import { HubMark } from '../settings/HubMark';
import { macSignIn } from '../settings/useMacHub';
import { teammateApi } from './api';
import { connectionsClient } from './connectionsClient';
import { words } from './routinesClient';
import { useCapabilities } from './useRoutines';

/**
 * What a starter suggests, for the person to act on: services and operations to tick in Accounts below, a routine
 * and a trigger to open in their editors. Nothing is granted, scheduled or subscribed here.
 */
export function TemplateSuggestions({ template, identity, onConnected, onSchedule, onTrigger, onDismiss }: {
  template: Template; identity: string; onConnected(): void; onSchedule(): void; onTrigger(): void; onDismiss(): void;
}) {
  const client = useMemo(() => connectionsClient(teammateApi), []);
  const caps = useCapabilities(identity);
  // The starter list was read once per session; what is connected now comes from the hub.
  const [live, setLive] = useState<string[] | null>(null), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  const refresh = () => client.list().then(list => setLive(list.filter(c => c.status === 'ok').map(c => c.provider))).catch(() => {});
  useEffect(() => { void refresh(); }, [client]); // eslint-disable-line react-hooks/exhaustive-deps
  const connect = async (provider: string) => {
    if (busy) return;
    setBusy(provider); setError('');
    try { await macSignIn(client, () => client.start(provider), () => false); await refresh(); onConnected(); }
    catch (e) { setError(words(e)); } finally { setBusy(null); }
  };
  const schedule = caps.routines ? template.schedule : null, trigger = caps.triggers && template.trigger && caps.triggerKinds.includes(template.trigger.kind) ? template.trigger : null;
  return <section className="teammate-suggestions" aria-label={`Suggested by ${template.name}`}>
    <header><div><h3>Suggested by {template.name}</h3><p className="profile-help">Nothing here is on yet. Tick what this teammate may use under Accounts, then set up its routine or trigger.</p></div>
      <button type="button" onClick={onDismiss}>Dismiss suggestions</button></header>
    <ul>{template.providers.map(p => <li key={p.provider}>
      <HubMark id={markId(p.provider)} size={22} />
      <span><strong>{p.name}</strong><small>{p.why}</small><small>{operationsLine(p)}</small></span>
      {(live ? live.includes(p.provider) : p.connected) ? <span className="hub-pill hub-pill--ok">Connected</span>
        : <button type="button" disabled={busy !== null} onClick={() => void connect(p.provider)}>{busy === p.provider ? 'Waiting for sign-in…' : `Connect ${p.name}`}</button>}</li>)}
      {schedule && <li><svg className="teammate-suggestions-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 3h6" /></svg><span><strong>Routine</strong><small>{recurrenceWords(schedule.recurrence)}: {schedule.prompt}</small></span>
        <button type="button" onClick={onSchedule}>Set up routine…</button></li>}
      {trigger && <li><svg className="teammate-suggestions-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M13 3 5 14h6l-1 7 8-11h-6z" /></svg><span><strong>Trigger</strong><small>When {triggerWords(trigger.kind).toLowerCase()}: {trigger.promptTemplate}</small></span>
        <button type="button" onClick={onTrigger}>Set up trigger…</button></li>}</ul>
    {error && <p role="alert" className="teammate-plan-note">{error}</p>}
  </section>;
}
