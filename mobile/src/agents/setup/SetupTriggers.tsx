import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Button } from '../../ui/primitives';
import type { RoutinesApi } from '../v2/routinesApi';
import { kindInfo, type Trigger, type TriggerDraft, type Webhook } from '../v2/triggersModel';
import { SetupHeading } from './SetupForm';
import { TriggerCard } from './TriggerCard';
import { TriggerEditor } from './TriggerEditor';
import { WebhookSetup } from './WebhookSetup';
import { bits } from './RoutineBits';

/** "When something happens": one teammate's event triggers. */
export function SetupTriggers({ api, agentId, kinds, triggers, onChange, onOpenRun, seed }: {
  api: RoutinesApi; agentId: string; kinds: string[]; triggers: Trigger[];
  onChange(next: Trigger | null, id: string): void; onOpenRun?(runId: string): void;
  /** A starter's suggestion: opens the editor filled in, once per nonce. Never saves by itself. */
  seed?: { draft: Partial<TriggerDraft>; nonce: number } | null;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [seeded, setSeeded] = useState<Partial<TriggerDraft> | undefined>();
  useEffect(() => { if (seed) { setSeeded(seed.draft); setEditing(true); } }, [seed?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const [created, setCreated] = useState<{ trigger: Trigger; webhook: Webhook } | null>(null);
  return (
    <View style={{ gap: 12 }}>
      <SetupHeading title="When something happens" description="Start a task from an event. Each run uses this teammate’s access, and changes still wait for your approval." />
      {created && (
        <View style={[bits.card, { borderColor: colors.accent, backgroundColor: colors.surface }]} accessibilityLabel="Finish webhook setup">
          <Text style={[bits.name, { color: colors.text }]}>Finish setting up {kindInfo(created.trigger.kind)?.label}</Text>
          <WebhookSetup kind={created.trigger.kind} url={created.webhook.url} secret={created.webhook.secret}
            types={Array.isArray(created.trigger.filter.types) ? (created.trigger.filter.types as string[]) : []} />
          <Button secondary title="I’ve saved it" label="Dismiss webhook details" onPress={() => setCreated(null)} />
        </View>
      )}
      {triggers.map(t => <TriggerCard key={t.id} api={api} trigger={t} onChange={next => onChange(next, t.id)} onOpenRun={onOpenRun} />)}
      {editing ? (
        <TriggerEditor key={seed?.nonce ?? 0} api={api} agentId={agentId} kinds={kinds} initial={seeded} onCancel={() => { setEditing(false); setSeeded(undefined); }}
          onSaved={(trigger, webhook) => { onChange(trigger, trigger.id); setEditing(false); setSeeded(undefined); if (webhook) setCreated({ trigger, webhook }); }} />
      ) : (
        <Button secondary title="Add a trigger" disabled={!kinds.length} onPress={() => setEditing(true)} />
      )}
    </View>
  );
}
