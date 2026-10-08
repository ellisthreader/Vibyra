import { useEffect, useState } from 'react';
import { words, type RoutinesClient } from './routinesClient';
import {
  WEEKDAYS, formatLocal, newScheduleDraft, previewKey, recurrenceOf, scheduleBody, scheduleProblem, todayIn,
  type Preview, type Schedule, type ScheduleDraft,
} from '../../../../mobile/src/agents/v2/routinesModel.ts';

const kinds = [['once', 'One-off'], ['daily', 'Daily'], ['weekly', 'Weekly']] as const;

/** A new routine: the server's next-run preview must load for these exact settings before Save. */
export function ScheduleEditor({ agentId, client, disabled, initial, onSaved, onCancel }: {
  /** A starter's suggested schedule; the person still reviews the time zone and saves it. */ initial?: Partial<ScheduleDraft>;
  agentId: string; client: RoutinesClient; disabled: boolean; onSaved(schedule: Schedule): void; onCancel(): void;
}) {
  const [draft, setDraft] = useState<ScheduleDraft>(() => ({ ...newScheduleDraft(''), ...initial }));
  const [preview, setPreview] = useState<{ key: string; data?: Preview; error?: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const update = (patch: Partial<ScheduleDraft>) => { setDraft(d => ({ ...d, ...patch })); setError(''); };
  // Timing can be previewed before the instructions are written.
  const timing = scheduleProblem({ ...draft, prompt: draft.prompt.trim() || 'preview' });
  const key = previewKey(draft);
  useEffect(() => {
    if (timing) return;
    let live = true;
    const timer = setTimeout(() => {
      client.preview(draft.timezone.trim(), recurrenceOf(draft))
        .then(data => { if (live) setPreview({ key, data }); })
        .catch(e => { if (live) setPreview({ key, error: words(e) }); });
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [key, timing]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = preview?.key === key && preview.data?.next.length ? preview.data : null;
  const problem = scheduleProblem(draft);
  const today = todayIn(draft.timezone.trim());
  const save = async () => {
    if (!ready || problem || busy) return;
    setBusy(true); setError('');
    try { onSaved(await client.createSchedule(scheduleBody(agentId, draft))); }
    catch (e) { setError(words(e)); } finally { setBusy(false); }
  };
  const previewText = timing ? timing : preview?.key !== key ? 'Checking the next run…' : preview.error ? preview.error
    : !ready ? 'This schedule has no future run. Choose a later date or time.' : null;
  return <div className="routine-editor" role="group" aria-label="New routine">
    <label>What should it do?<textarea aria-label="Routine instructions" maxLength={20000} value={draft.prompt} disabled={disabled}
      placeholder="Every morning, review new issues and list the ones that need me…" onChange={e => update({ prompt: e.target.value })} /></label>
    <div className="routine-row">
      <div className="routine-segments" role="radiogroup" aria-label="Repeats">{kinds.map(([type, label]) =>
        <button type="button" role="radio" key={type} aria-checked={draft.type === type} disabled={disabled} onClick={() => update({ type })}>{label}</button>)}</div>
      {draft.type === 'weekly' && <div className="routine-days" role="group" aria-label="Days">{WEEKDAYS.map(w =>
        <button type="button" key={w.day} aria-label={w.name} aria-pressed={draft.weekdays.includes(w.day)} disabled={disabled}
          onClick={() => update({ weekdays: draft.weekdays.includes(w.day) ? draft.weekdays.filter(d => d !== w.day) : [...draft.weekdays, w.day] })}>{w.short}</button>)}</div>}
    </div>
    <div className="routine-row routine-fields">
      {draft.type === 'once' && <label>Date<input type="date" value={draft.date} disabled={disabled} onChange={e => update({ date: e.target.value })} /></label>}
      <label>Time<input type="time" value={draft.time} disabled={disabled} onChange={e => update({ time: e.target.value })} /></label>
      <label className="routine-zone">Timezone<input value={draft.timezone} maxLength={64} spellCheck={false} disabled={disabled} onChange={e => update({ timezone: e.target.value })} /></label>
    </div>
    <p className="routine-preview" aria-live="polite" data-ready={Boolean(ready)}>
      {ready ? <><strong>Next run: {formatLocal(ready.next[0]!.local, today)}</strong>
        {ready.next.length > 1 && <span> · then {ready.next.slice(1).map(n => formatLocal(n.local, today)).join(', ')}</span>}
        <small>{ready.description} · {draft.timezone.trim()}</small></> : previewText}
    </p>
    {error && <p role="alert" className="routines-error">{error}</p>}
    <div className="routine-actions">
      <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className="primary" disabled={disabled || busy || !ready || Boolean(problem)} title={problem ?? undefined}
        onClick={() => void save()}>{busy ? 'Saving…' : 'Save routine'}</button>
    </div>
  </div>;
}
