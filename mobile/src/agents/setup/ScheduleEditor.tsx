import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Button, Hint } from '../../ui/primitives';
import type { RoutinesApi } from '../v2/routinesApi';
import {
  WEEKDAYS, formatLocal, newScheduleDraft, previewKey, recurrenceOf, scheduleBody, scheduleProblem, todayIn,
  type Preview, type Schedule, type ScheduleDraft,
} from '../v2/routinesModel';
import { SetupField, form } from './SetupForm';
import { Chip, ChipRow, bits } from './RoutineBits';

const KINDS = [{ type: 'once', label: 'One-off' }, { type: 'daily', label: 'Daily' }, { type: 'weekly', label: 'Weekly' }] as const;
const TIMES = ['08:00', '09:00', '12:00', '18:00'];

/** Turns a routine into a real schedule. Save waits for the server's next-run preview of exactly these settings. */
export function ScheduleEditor({ api, agentId, prompt, initial, onSaved, onCancel }: {
  api: RoutinesApi; agentId: string; prompt: string; /** A starter's suggestion, filled in for the person to review. */ initial?: Partial<ScheduleDraft>;
  onSaved(schedule: Schedule): void; onCancel(): void;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<ScheduleDraft>(() => ({ ...newScheduleDraft(prompt), ...initial }));
  const [preview, setPreview] = useState<{ key: string; value: Preview } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = scheduleProblem(draft);
  const key = previewKey(draft);
  const change = (patch: Partial<ScheduleDraft>) => { setDraft(d => ({ ...d, ...patch })); setError(''); };
  useEffect(() => {
    if (problem) return;
    let live = true;
    const timer = setTimeout(() => {
      api.preview(draft.timezone.trim(), recurrenceOf(draft))
        .then(value => { if (live) setPreview({ key, value }); })
        .catch(e => { if (live) { setPreview(null); setError(e instanceof Error ? e.message : 'The next run could not be checked.'); } });
    }, 400);
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, problem === null, api]);
  const shown = preview?.key === key ? preview.value : null;
  const today = todayIn(draft.timezone.trim());
  const save = async () => {
    if (!shown || busy) return;
    setBusy(true); setError('');
    try { onSaved(await api.create(scheduleBody(agentId, draft))); }
    catch (e) { setError(e instanceof Error ? e.message : 'The routine could not be scheduled.'); }
    finally { setBusy(false); }
  };
  return (
    <View style={[bits.card, { borderColor: colors.border, backgroundColor: colors.surface, gap: 16 }]}>
      <SetupField label="What should it do?" accessibilityLabel="Routine instructions" value={draft.prompt} multiline maxLength={20000}
        onChangeText={value => change({ prompt: value })} placeholder="Review my notes and list open decisions…" style={{ minHeight: 88 }} />
      <View style={form.field}>
        <Text style={[form.label, { color: colors.text }]}>Repeats</Text>
        <ChipRow label="Repeats">{KINDS.map(k => <Chip key={k.type} label={k.label} selected={draft.type === k.type} onPress={() => change({ type: k.type })} />)}</ChipRow>
        {draft.type === 'weekly' && (
          <ChipRow label="Days">{WEEKDAYS.map(d => (
            <Chip key={d.day} label={d.short} a11y={d.name} selected={draft.weekdays.includes(d.day)}
              onPress={() => change({ weekdays: draft.weekdays.includes(d.day) ? draft.weekdays.filter(x => x !== d.day) : [...draft.weekdays, d.day] })} />
          ))}</ChipRow>
        )}
      </View>
      {draft.type === 'once' && <SetupField label="Date" accessibilityLabel="Routine date" value={draft.date} placeholder="2026-10-01"
        autoCapitalize="none" onChangeText={date => change({ date })} />}
      <View style={form.field}>
        <SetupField label="Time" accessibilityLabel="Routine time" value={draft.time} placeholder="09:00" keyboardType="numbers-and-punctuation"
          onChangeText={time => change({ time })} />
        <ChipRow label="Quick times">{TIMES.map(t => <Chip key={t} label={t} a11y={`Set time to ${t}`} selected={draft.time === t} onPress={() => change({ time: t })} />)}</ChipRow>
      </View>
      <SetupField label="Timezone" accessibilityLabel="Routine timezone" value={draft.timezone} autoCapitalize="none" autoCorrect={false}
        onChangeText={timezone => change({ timezone })} hint="Times follow this zone, including daylight saving." />
      <View style={{ gap: 4 }} accessibilityLiveRegion="polite">
        {problem ? <Hint>{problem}</Hint> : shown ? <>
          <Text style={[form.label, { color: colors.text }]}>Next run: {formatLocal(shown.next[0]?.local, today) || 'none'}</Text>
          <Text style={[bits.body, { color: colors.muted }]}>
            {[shown.description, shown.next.length > 1 && `then ${shown.next.slice(1).map(n => formatLocal(n.local, today)).join(', ')}`].filter(Boolean).join(' · ')}
          </Text>
        </> : !error && <Hint>Checking the next run…</Hint>}
        {error ? <Hint error>{error}</Hint> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button secondary title="Cancel" label="Cancel scheduling" disabled={busy} onPress={onCancel} /></View>
        <View style={{ flex: 1 }}><Button title="Save schedule" disabled={Boolean(problem) || !shown} busy={busy} onPress={() => void save()} /></View>
      </View>
    </View>
  );
}
