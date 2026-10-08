import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Hint } from '../../ui/primitives';
import type { RoutinesApi } from '../v2/routinesApi';
import { formatInstant, occurrenceLabel, scheduleLabel, type Occurrence, type Schedule } from '../v2/routinesModel';
import { HistoryRows, StatusPill, TextAction, bits } from './RoutineBits';

/** One saved schedule: its state, pause/resume, delete, and a compact occurrence history. */
export function ScheduleCard({ api, schedule, onChange, onOpenRun }: {
  api: RoutinesApi; schedule: Schedule; onChange(next: Schedule | null): void; onOpenRun?(runId: string): void;
}) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [history, setHistory] = useState<Occurrence[] | null>(null);
  const [open, setOpen] = useState(false);
  const act = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'The routine could not be updated.'); }
    finally { setBusy(false); }
  };
  const toggleHistory = () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    void act(async () => setHistory(await api.history(schedule.id)));
  };
  const label = scheduleLabel(schedule);
  const name = schedule.title || schedule.prompt.split('\n')[0]!.slice(0, 80);
  return (
    <View style={[bits.card, { borderColor: colors.border, backgroundColor: colors.surface }]} accessibilityLabel={`Routine: ${name}`}>
      <View style={{ gap: 6 }}>
        <Text style={[bits.name, { color: colors.text }]} numberOfLines={2}>{name}</Text>
        <StatusPill label={label} tone={schedule.paused ? 'muted' : label.startsWith('Active') ? 'ok' : 'muted'} />
        <Text style={[bits.body, { color: colors.muted }]}>{schedule.description} · {schedule.timezone}</Text>
      </View>
      <View style={bits.row}>
        <TextAction label={schedule.paused ? 'Resume' : 'Pause'} a11y={`${schedule.paused ? 'Resume' : 'Pause'} routine ${name}`} disabled={busy}
          onPress={() => void act(async () => onChange(await api.pause(schedule.id, !schedule.paused)))} />
        <TextAction label={open ? 'Hide history' : 'History'} a11y={`${open ? 'Hide' : 'Show'} history for ${name}`} disabled={busy && !open} onPress={toggleHistory} />
        {confirming ? <>
          <TextAction danger label="Delete routine" a11y={`Confirm delete ${name}`} disabled={busy}
            onPress={() => void act(async () => { await api.remove(schedule.id); onChange(null); })} />
          <TextAction label="Keep" onPress={() => setConfirming(false)} />
        </> : <TextAction danger label="Delete" a11y={`Delete routine ${name}`} disabled={busy} onPress={() => setConfirming(true)} />}
      </View>
      {open && history && (
        <HistoryRows empty="No runs yet. Past and skipped times appear here." onOpenRun={onOpenRun}
          rows={history.map(o => ({ id: o.id, ...occurrenceLabel(o), when: formatInstant(o.intendedAt, schedule.timezone), runId: o.runId }))} />
      )}
      {error ? <Hint error>{error}</Hint> : null}
    </View>
  );
}
