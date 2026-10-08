import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Button, Hint } from '../../ui/primitives';
import type { RoutinesApi } from '../v2/routinesApi';
import { deviceTimezone, formatInstant } from '../v2/routinesModel';
import {
  eventLabel, eventTitle, filterSummary, isWebhook, kindInfo, triggerStatus, type Trigger, type TriggerEvent,
} from '../v2/triggersModel';
import { SetupField } from './SetupForm';
import { HistoryRows, StatusPill, TextAction, bits } from './RoutineBits';
import { WebhookSetup } from './WebhookSetup';

/** One saved trigger: what it listens for, what it does, its cap, pause, delete and event history. */
export function TriggerCard({ api, trigger, onChange, onOpenRun }: {
  api: RoutinesApi; trigger: Trigger; onChange(next: Trigger | null): void; onOpenRun?(runId: string): void;
}) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [events, setEvents] = useState<TriggerEvent[] | null>(null);
  const [open, setOpen] = useState<'history' | 'setup' | null>(null);
  const [secret, setSecret] = useState('');
  const name = kindInfo(trigger.kind)?.label ?? trigger.kind;
  const act = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setSaved('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'The trigger could not be updated.'); }
    finally { setBusy(false); }
  };
  const show = (panel: 'history' | 'setup') => {
    setOpen(open === panel ? null : panel);
    if (panel === 'history' && open !== panel) void act(async () => setEvents(await api.triggers.events(trigger.id)));
  };
  const status = triggerStatus(trigger);
  const zone = deviceTimezone();
  return (
    <View style={[bits.card, { borderColor: colors.border, backgroundColor: colors.surface }]} accessibilityLabel={`Trigger: ${name}`}>
      <View style={{ gap: 6 }}>
        <Text style={[bits.name, { color: colors.text }]}>{name}</Text>
        <StatusPill label={status.label} tone={status.tone} />
        <Text style={[bits.body, { color: colors.muted }]} numberOfLines={2}>{filterSummary(trigger)}</Text>
        <Text style={[bits.body, { color: colors.text }]} numberOfLines={3}>{trigger.promptTemplate}</Text>
      </View>
      <View style={bits.row}>
        <TextAction label={trigger.paused ? 'Resume' : 'Pause'} a11y={`${trigger.paused ? 'Resume' : 'Pause'} ${name} trigger`} disabled={busy}
          onPress={() => void act(async () => onChange(await api.triggers.pause(trigger.id, !trigger.paused)))} />
        <TextAction label={open === 'history' ? 'Hide history' : 'History'} a11y={`${open === 'history' ? 'Hide' : 'Show'} ${name} events`} onPress={() => show('history')} />
        {isWebhook(trigger.kind) && trigger.webhookUrl &&
          <TextAction label={open === 'setup' ? 'Hide setup' : 'Setup'} a11y={`${name} webhook setup`} onPress={() => show('setup')} />}
        {confirming ? <>
          <TextAction danger label="Delete trigger" a11y={`Confirm delete ${name} trigger`} disabled={busy}
            onPress={() => void act(async () => { await api.triggers.remove(trigger.id); onChange(null); })} />
          <TextAction label="Keep" onPress={() => setConfirming(false)} />
        </> : <TextAction danger label="Delete" a11y={`Delete ${name} trigger`} disabled={busy} onPress={() => setConfirming(true)} />}
      </View>
      {open === 'setup' && trigger.webhookUrl && (
        <WebhookSetup kind={trigger.kind} url={trigger.webhookUrl} secret={null}
          types={Array.isArray(trigger.filter.types) ? (trigger.filter.types as string[]) : []} />
      )}
      {trigger.kind === 'stripe.event' && (
        <View style={{ gap: 8 }}>
          <SetupField label="Stripe signing secret" accessibilityLabel={`Stripe signing secret for ${name}`} value={secret} secureTextEntry autoCapitalize="none"
            placeholder="whsec_…" onChangeText={value => { setSecret(value); setSaved(''); }} hint="The hook stays off until this is saved." />
          <Button secondary title="Save signing secret" disabled={!/^whsec_[A-Za-z0-9]{16,128}$/.test(secret.trim())} busy={busy}
            onPress={() => void act(async () => {
              onChange(await api.triggers.update(trigger.id, { revision: trigger.revision, signingSecret: secret.trim() }));
              setSecret(''); setSaved('Signing secret saved.');
            })} />
        </View>
      )}
      {open === 'history' && events && (
        <HistoryRows empty="Nothing has happened yet." onOpenRun={onOpenRun}
          rows={events.map(e => ({ id: e.id, ...eventLabel(e), title: eventTitle(e), when: formatInstant(e.createdAt, zone), runId: e.runId }))} />
      )}
      {saved ? <Hint>{saved}</Hint> : null}
      {error ? <Hint error>{error}</Hint> : null}
    </View>
  );
}
