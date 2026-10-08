import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Button, Hint } from '../../ui/primitives';
import type { RoutinesApi } from '../v2/routinesApi';
import {
  TRIGGER_KINDS, kindInfo, newTriggerDraft, triggerBody, triggerProblem, type Connection, type Trigger, type TriggerDraft, type Webhook,
} from '../v2/triggersModel';
import { SetupField, form } from './SetupForm';
import { Chip, ChipRow, bits } from './RoutineBits';

const numberField = (value: number) => (Number.isFinite(value) ? String(value) : '');

/** A new "when something happens" trigger. Filters are the person's own; nothing here is model-chosen. */
export function TriggerEditor({ api, agentId, kinds, initial, onSaved, onCancel }: {
  api: RoutinesApi; agentId: string; kinds: string[]; /** A starter's suggestion, filled in for the person to review. */ initial?: Partial<TriggerDraft>;
  onSaved(trigger: Trigger, webhook: Webhook | null): void; onCancel(): void;
}) {
  const { colors } = useTheme();
  const offered = TRIGGER_KINDS.filter(k => kinds.includes(k.kind));
  const [draft, setDraft] = useState<TriggerDraft>(() => ({ ...newTriggerDraft(initial?.kind ?? offered[0]?.kind ?? 'github.issue'), ...initial }));
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const provider = kindInfo(draft.kind)?.provider;
  const change = (patch: Partial<TriggerDraft>) => { setDraft(d => ({ ...d, ...patch })); setError(''); };
  useEffect(() => {
    if (!provider || connections) return;
    let live = true;
    api.connections().then(list => { if (live) setConnections(list); })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : 'Connected accounts could not be loaded.'); });
    return () => { live = false; };
  }, [api, provider, connections]);
  const accounts = (connections ?? []).filter(c => c.provider === provider && c.health === 'healthy');
  const problem = triggerProblem(draft);
  const save = async () => {
    if (problem || busy) return;
    setBusy(true); setError('');
    try { const result = await api.triggers.create(triggerBody(agentId, draft)); onSaved(result.trigger, result.webhook); }
    catch (e) {
      const code = (e as { code?: string | null }).code;
      setError(code === 'not_granted' ? `Allow ${provider === 'gmail' ? 'Gmail search' : 'Calendar events'} for this teammate above, save, then try again.`
        : e instanceof Error ? e.message : 'The trigger could not be saved.');
    } finally { setBusy(false); }
  };
  return (
    <View style={[bits.card, { borderColor: colors.border, backgroundColor: colors.surface, gap: 16 }]}>
      <View style={form.field}>
        <Text style={[form.label, { color: colors.text }]}>When</Text>
        <ChipRow label="Trigger kind">{offered.map(k => (
          <Chip key={k.kind} label={k.label} selected={draft.kind === k.kind}
            onPress={() => setDraft(d => ({ ...newTriggerDraft(k.kind), ratePerHour: d.ratePerHour }))} />
        ))}</ChipRow>
      </View>
      {draft.kind.startsWith('github.') && <>
        <SetupField label="Repository" accessibilityLabel="GitHub repository" value={draft.repository} placeholder="owner/repo" autoCapitalize="none"
          autoCorrect={false} onChangeText={repository => change({ repository })} hint="Leave empty for any repository that sends this webhook." />
        <SetupField label="Actions" accessibilityLabel="GitHub actions" value={draft.actions} autoCapitalize="none" onChangeText={actions => change({ actions })}
          hint="Comma separated, for example opened, labeled." />
        <SetupField label="Labels" accessibilityLabel="GitHub labels" value={draft.labels} placeholder="bug, urgent" onChangeText={labels => change({ labels })}
          hint="Optional. Runs when any of these labels is present." />
      </>}
      {draft.kind === 'stripe.event' && <>
        <SetupField label="Event types" accessibilityLabel="Stripe event types" value={draft.types} placeholder="invoice.paid, customer.*" autoCapitalize="none"
          autoCorrect={false} onChangeText={types => change({ types })} />
        <SetupField label="Signing secret" accessibilityLabel="Stripe signing secret" value={draft.signingSecret} placeholder="whsec_… (optional now)"
          secureTextEntry autoCapitalize="none" onChangeText={signingSecret => change({ signingSecret })}
          hint="Stripe shows it after you add the endpoint. You can paste it later." />
      </>}
      {provider && (
        <View style={form.field}>
          <Text style={[form.label, { color: colors.text }]}>{provider === 'gmail' ? 'Gmail account' : 'Calendar account'}</Text>
          {accounts.length ? <ChipRow label="Connected account">{accounts.map(c => (
            <Chip key={c.id} label={c.account} selected={draft.connectionId === c.id} onPress={() => change({ connectionId: c.id })} />
          ))}</ChipRow> : <Hint>{connections ? 'Connect this account for the teammate in Tools above first.' : 'Loading connected accounts…'}</Hint>}
        </View>
      )}
      {draft.kind === 'gmail.message' && <>
        <SetupField label="Search filter" accessibilityLabel="Gmail search filter" value={draft.query} placeholder="from:billing@example.com"
          autoCapitalize="none" onChangeText={query => change({ query })} hint="A Gmail search. Leave empty for every new message." />
        <SetupField label="Check every (minutes)" accessibilityLabel="Gmail check interval in minutes" value={numberField(draft.pollMinutes)}
          keyboardType="number-pad" onChangeText={v => change({ pollMinutes: Number(v) })} />
      </>}
      {draft.kind === 'calendar.event_soon' && <>
        <SetupField label="Minutes before" accessibilityLabel="Minutes before the event" value={numberField(draft.leadMinutes)}
          keyboardType="number-pad" onChangeText={v => change({ leadMinutes: Number(v) })} />
        <SetupField label="Calendar" accessibilityLabel="Calendar id" value={draft.calendarId} autoCapitalize="none" onChangeText={calendarId => change({ calendarId })} />
      </>}
      <SetupField label="Then" accessibilityLabel="Trigger instructions" value={draft.promptTemplate} multiline maxLength={8000}
        onChangeText={promptTemplate => change({ promptTemplate })} style={{ minHeight: 88 }}
        hint="The event's details are added after this as data, never as instructions." />
      <SetupField label="Hourly cap" accessibilityLabel="Maximum runs an hour" value={numberField(draft.ratePerHour)} keyboardType="number-pad"
        onChangeText={v => change({ ratePerHour: Number(v) })} hint="Extra events in an hour are skipped, not queued." />
      {(problem || error) ? <Hint error={Boolean(error)}>{error || problem}</Hint> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button secondary title="Cancel" label="Cancel trigger" disabled={busy} onPress={onCancel} /></View>
        <View style={{ flex: 1 }}><Button title="Save trigger" disabled={Boolean(problem)} busy={busy} onPress={() => void save()} /></View>
      </View>
    </View>
  );
}
