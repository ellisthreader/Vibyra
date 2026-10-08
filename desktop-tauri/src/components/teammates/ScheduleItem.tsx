import { useState } from 'react';
import { words, type RoutinesClient } from './routinesClient';
import { formatInstant, occurrenceLabel, scheduleLabel, type Occurrence, type Schedule } from '../../../../mobile/src/agents/v2/routinesModel.ts';

const excerpt = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** One saved routine: state, pause/resume, delete (confirmed) and its recent occurrences. */
export function ScheduleItem({ schedule: s, client, disabled, onChanged, onOpenChat }: {
  schedule: Schedule; client: RoutinesClient; disabled: boolean; onChanged(next: Schedule | null): void; onOpenChat(): void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState(false);
  const [history, setHistory] = useState<Occurrence[] | null>(null), [open, setOpen] = useState(false);
  const act = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); } catch (e) { setError(words(e)); } finally { setBusy(false); }
  };
  const toggleHistory = () => {
    setOpen(!open);
    if (!open) void act(async () => setHistory(await client.occurrences(s.id)));
  };
  const name = s.title || excerpt(s.prompt);
  return <div className="routine-item" aria-label={`Routine: ${name}`} role="group">
    <div className="routine-head">
      <span><strong>{name}</strong><small>{s.description} · {s.timezone}</small><small>{s.executionTarget === 'cloud' ? `Cloud · ${s.accountLabel || 'selected Claude account'}` : 'My computer'}</small></span>
      <span className="routine-state" data-tone={s.paused ? 'muted' : s.nextRunLocal ? 'ok' : 'muted'}>{scheduleLabel(s)}</span>
    </div>
    <div className="routine-actions">
      <button type="button" disabled={disabled || busy} onClick={() => void act(async () => onChanged(await client.pauseSchedule(s.id, !s.paused)))}
        aria-label={`${s.paused ? 'Resume' : 'Pause'} routine ${name}`}>{s.paused ? 'Resume' : 'Pause'}</button>
      <button type="button" aria-expanded={open} aria-label={`History for routine ${name}`} onClick={toggleHistory}>History</button>
      <button type="button" disabled={disabled || busy} aria-label={`Delete routine ${name}`} onClick={() => setConfirm(true)}>Delete</button>
    </div>
    {confirm && <div className="routine-confirm" role="alert">Delete this routine? Future runs stop; its history stays in the conversation.
      <button type="button" disabled={busy} onClick={() => void act(async () => { await client.deleteSchedule(s.id); onChanged(null); })}>Delete routine</button>
      <button type="button" onClick={() => setConfirm(false)}>Keep</button></div>}
    {error && <p role="alert" className="routines-error">{error}</p>}
    {open && <ul className="routine-history" aria-label="Recent runs">
      {!history ? <li>Loading…</li> : !history.length ? <li>No runs yet.</li> : history.map(o => {
        const { label, tone } = occurrenceLabel(o);
        return <li key={o.id}><time dateTime={o.intendedAt}>{formatInstant(o.intendedAt, s.timezone)}</time>
          <span data-tone={tone}>{label}</span>
          {o.runId && <button type="button" onClick={onOpenChat} aria-label={`Open the ${formatInstant(o.intendedAt, s.timezone)} run in chat`}>Open in chat</button>}</li>;
      })}
    </ul>}
  </div>;
}
