import { useEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { useIntegrations } from '../integrations/IntegrationsProvider';
import { Button, Hint, Icon } from '../ui/primitives';
import { OverlaySheet } from '../ui/OverlaySheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VibesError } from '../vibes/api';
import { deleteFlag, readFlag, writeFlag } from '../transport/deviceFlags';
import { RoutineDrafts } from './setup/RoutineDrafts';
import { TeammateAvatar } from './TeammateAvatar';
import type { AgentsApi, Avatar, Teammate, TeammateFields } from './types';

export function TeammateSetup({ visible, agent, api, enabled, identity, onClose, onSaved }: {
  visible: boolean; agent?: Teammate; api: AgentsApi; enabled: boolean; identity: string; onClose(): void; onSaved(agent: Teammate): void;
}) {
  const { colors } = useTheme(); const inset = useSafeAreaInsets().bottom; const { installed, live } = useIntegrations();
  const [fields, setFields] = useState<TeammateFields>(() => agent ? { name: agent.name, brief: agent.brief, memory: agent.memory,
    avatar: agent.avatar, budget: agent.budget, integrations: agent.integrations } : { name: '', brief: '', memory: '', avatar: 'assistant', budget: 5, integrations: [] });
  const [budget, setBudget] = useState(String(fields.budget)); const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false); const lock = useRef(false); const [error, setError] = useState<string | null>(null);
  // Keep the exact create identity and payload after an ambiguous response. Editing cannot create a second teammate.
  const attempt = useRef<{ id: string; revision?: number; fields: TeammateFields } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const saveKey = `agent-save.${encodeURIComponent(identity)}.${agent?.id ?? 'new'}`;
  const [restored, setRestored] = useState(false); const [restoreVersion, setRestoreVersion] = useState(0);
  useEffect(() => {
    let active = true; setError(null);
    void readFlag(saveKey).then(raw => {
      if (!active) return;
      if (raw) {
        const saved = JSON.parse(raw) as NonNullable<typeof attempt.current>;
        if (!saved.id || !saved.fields?.name || !saved.fields.brief) throw new Error('Saved setup could not be read.');
        attempt.current = saved; setFields(saved.fields); setBudget(String(saved.fields.budget)); setUncertain(true);
      }
      setRestored(true);
    }).catch(() => { if (active) setError('Your pending save could not be restored. Retry before making another teammate.'); });
    return () => { active = false; };
  }, [saveKey, restoreVersion]);
  const edit = <K extends keyof TeammateFields>(key: K, value: TeammateFields[K]) => setFields(current => ({ ...current, [key]: value }));
  const valid = fields.name.trim() && fields.brief.trim() && /^\d+$/.test(budget) && Number(budget) >= 1 && Number(budget) <= 50;
  const save = async () => {
    if (lock.current || !valid || !enabled || !restored) return;
    lock.current = true; setBusy(true); setError(null);
    const request = attempt.current ?? { id: agent?.id ?? randomUUID(), revision: agent?.revision,
      fields: { ...fields, name: fields.name.trim(), brief: fields.brief.trim(), budget: Number(budget) } };
    attempt.current = request;
    try {
      // The retry identity reaches private device storage before any server write.
      await writeFlag(saveKey, JSON.stringify(request));
      const saved = await api.save(request.fields, request);
      await deleteFlag(saveKey); attempt.current = null; setUncertain(false); onSaved(saved);
    }
    catch (e) {
      const ambiguous = !(e instanceof VibesError) || e.status === 0 || e.status >= 500;
      setUncertain(ambiguous); if (!ambiguous) { attempt.current = null; await deleteFlag(saveKey).catch(() => {}); }
      setError(e instanceof Error ? e.message : 'Could not save this teammate.');
    } finally { lock.current = false; setBusy(false); }
  };
  const archive = async () => {
    if (!agent || lock.current || !restored) return;
    lock.current = true; setBusy(true); setError(null);
    try { onSaved(await api.archive(agent, !agent.archived)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not change this teammate.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const editable = restored && enabled && !agent?.archived && !busy && !uncertain;
  const fieldStyle = [s.input, { color: colors.text, backgroundColor: colors.elevated }];
  return <OverlaySheet visible={visible} title={agent ? 'Teammate details' : 'New teammate'} onClose={onClose}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.identity}><TeammateAvatar avatar={fields.avatar} size={64} /><Text style={[s.location, { color: colors.muted }]}>Vibyra Cloud</Text></View>
      <Text style={[s.label, { color: colors.text }]}>Name</Text>
      <TextInput accessibilityLabel="Teammate name" value={fields.name} onChangeText={v => edit('name', v)} maxLength={80} editable={editable} style={fieldStyle} placeholder="Website helper" placeholderTextColor={colors.muted} />
      <Text style={[s.label, { color: colors.text }]}>What should it look after?</Text>
      <TextInput accessibilityLabel="Teammate job" value={fields.brief} onChangeText={v => edit('brief', v)} multiline maxLength={4000} editable={editable}
        style={[...fieldStyle, s.brief]} placeholder="Review my website and prepare useful improvements." placeholderTextColor={colors.muted} />
      <Text style={[s.label, { color: colors.text }]}>Connected services</Text>
      {!installed.length && <Hint>No services connected. You can add access later.</Hint>}
      {installed.map(app => <Pressable key={app.id} accessibilityRole="checkbox" accessibilityLabel={`Allow ${app.name}`}
        accessibilityState={{ checked: fields.integrations.includes(app.id), disabled: !editable || !live }} disabled={!editable || !live}
        onPress={() => edit('integrations', fields.integrations.includes(app.id) ? fields.integrations.filter(id => id !== app.id) : [...fields.integrations, app.id].slice(0, 3))} style={s.service}>
        <View style={s.grow}><Text style={[s.label, { color: colors.text }]}>{app.name}</Text><Text style={[s.detail, { color: colors.muted }]}>{app.reads}</Text></View>
        <Icon name={fields.integrations.includes(app.id) ? 'checkmark-circle' : 'ellipse-outline'} color={fields.integrations.includes(app.id) ? colors.accent : colors.muted} />
      </Pressable>)}
      {fields.integrations.filter(id => !installed.some(app => app.id === id)).map(id => <Button key={id} secondary title={`Remove unavailable ${id} access`}
        disabled={!editable} onPress={() => edit('integrations', fields.integrations.filter(value => value !== id))} />)}
      <Hint>Reads use the services you select. Changes and sends wait for your approval.</Hint>
      <View style={s.service}><Text style={[s.label, s.grow, { color: colors.text }]}>Vibes per task</Text><TextInput accessibilityLabel="Vibes per task" value={budget}
        onChangeText={setBudget} keyboardType="number-pad" maxLength={2} editable={editable} style={[...fieldStyle, s.budget]} /></View>
      <Hint>Up to this amount from your balance, per task. Unused Vibes are returned.</Hint>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails(!details)} style={s.service}>
        <Text style={[s.label, s.grow, { color: colors.text }]}>Avatar & saved notes</Text><Icon name={details ? 'chevron-up' : 'chevron-down'} size={18} /></Pressable>
      {details && <><View style={s.avatars}>{(['site', 'review', 'oncall', 'assistant', 'lead', 'bugs', 'db', 'qa', 'sprout'] as Avatar[]).map(avatar => <Pressable key={avatar}
        accessibilityRole="radio" accessibilityLabel={`${avatar} avatar`} accessibilityState={{ checked: avatar === fields.avatar }} disabled={!editable} onPress={() => edit('avatar', avatar)}
        style={[s.avatar, avatar === fields.avatar && { backgroundColor: colors.elevated }]}><TeammateAvatar avatar={avatar} /></Pressable>)}</View>
        <TextInput accessibilityLabel="Teammate saved notes" value={fields.memory} onChangeText={v => edit('memory', v)} multiline maxLength={4000} editable={editable}
          style={[...fieldStyle, s.brief]} placeholder="Context it should remember" placeholderTextColor={colors.muted} /></>}
      {agent && <RoutineDrafts identity={identity} id={agent.id} />}
      {agent && <Button secondary title={agent.archived ? 'Restore teammate' : 'Archive teammate'} disabled={!restored || busy || uncertain} onPress={() => void archive()} />}
    </ScrollView>
    <View style={[s.footer, { paddingBottom: inset + 16 }]}>{error && <Hint error>{error}</Hint>}
      {uncertain && <Hint>Retry checks the same save request. Your entered details are held until it is confirmed.</Hint>}
      {!restored && error && <Button secondary title="Restore pending save" onPress={() => setRestoreVersion(value => value + 1)} />}
      {!agent?.archived && <Button title={uncertain ? 'Retry save' : agent ? 'Save changes' : 'Create teammate'} busy={busy} disabled={!restored || !valid || !enabled} onPress={() => void save()} />}
    </View>
  </OverlaySheet>;
}
const s = StyleSheet.create({ content: { padding: 22, gap: 12 }, identity: { alignItems: 'center', gap: 4 }, location: { fontSize: 13 },
  label: { fontSize: 16, fontWeight: '500' }, input: { minHeight: 48, padding: 12, borderRadius: 14, fontSize: 16 },
  brief: { minHeight: 104, textAlignVertical: 'top' }, service: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 }, detail: { fontSize: 13, lineHeight: 19 }, budget: { width: 62, textAlign: 'center' },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, avatar: { padding: 4, borderRadius: 14 }, footer: { paddingHorizontal: 22, paddingTop: 12, gap: 10 } });
