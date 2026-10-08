import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useTheme } from '../../theme';
import { Hint, Icon } from '../../ui/primitives';
import { font } from '../../ui/font';
import { deleteFlag, readFlag, writeFlag } from '../../transport/deviceFlags';
import { TeammateAvatar } from '../TeammateAvatar';
import type { AgentsApi, Avatar, Teammate } from '../types';
import { templateMarkKey, type Template } from '../v2/templatesModel';

const pendingKey = (identity: string, key: string) => `agent-template-create.${encodeURIComponent(identity)}.${key}`;
const blurb = (t: Template) => (t.providers.length ? `Works with ${t.providers.map(p => p.name).join(', ')}` : 'Starts with just a brief');

/**
 * "Start from a template" for a new teammate (v2). One tap creates the profile only; its id is kept
 * until the server answers so a retry makes the same teammate. Access, routines and triggers are then
 * offered as suggestions on the Access tab — nothing is granted or scheduled here.
 */
export function TemplatePicker({ api, identity, disabled, onCreated }: {
  api: AgentsApi; identity: string; disabled: boolean; onCreated(agent: Teammate): void;
}) {
  const { colors } = useTheme();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    api.overview?.templates().then(list => { if (alive.current) setTemplates(list); }).catch(() => {});
    return () => { alive.current = false; };
  }, [api]);
  if (!api.overview || !templates.length) return null;
  const start = async (t: Template) => {
    if (busy || disabled) return;
    setBusy(t.key); setError('');
    try {
      const saved = await readFlag(pendingKey(identity, t.key)).catch(() => null);
      const id = saved && /^[0-9a-f-]{36}$/i.test(saved) ? saved : randomUUID();
      if (id !== saved) await writeFlag(pendingKey(identity, t.key), id).catch(() => {});
      const teammate = await api.overview!.fromTemplate(t.key, id);
      await writeFlag(templateMarkKey(identity, teammate.id), JSON.stringify({ key: t.key })).catch(() => {});
      await deleteFlag(pendingKey(identity, t.key)).catch(() => {});
      if (alive.current) onCreated(teammate);
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0;
      // A confirmed refusal frees the id; an interrupted request keeps it so the retry is the same create.
      if (status >= 400 && status < 500) await deleteFlag(pendingKey(identity, t.key)).catch(() => {});
      if (alive.current) setError(e instanceof Error ? e.message : 'The teammate could not be created.');
    } finally { if (alive.current) setBusy(null); }
  };
  return (
    <View style={s.body} testID="template-picker">
      <Text accessibilityRole="header" style={[s.section, { color: colors.muted }]}>Start from a template</Text>
      {templates.map(t => (
        <Pressable key={t.key} accessibilityRole="button" accessibilityLabel={`${t.name}. ${blurb(t)}`} accessibilityState={{ busy: busy === t.key, disabled: disabled || busy !== null }}
          disabled={disabled || busy !== null} onPress={() => void start(t)} style={({ pressed }) => [s.row, { opacity: busy && busy !== t.key ? 0.5 : pressed ? 0.6 : 1 }]}>
          <TeammateAvatar avatar={t.avatar as Avatar} size={38} />
          <View style={s.grow}>
            <Text style={[s.name, { color: colors.text }]}>{t.name}</Text>
            <Text style={[s.detail, { color: colors.muted }]}>{busy === t.key ? 'Creating…' : blurb(t)}</Text>
          </View>
          <Icon name="arrow-forward" size={17} color={colors.muted} />
        </Pressable>
      ))}
      {error ? <Hint error>{error}</Hint> : <Text style={[s.detail, { color: colors.muted }]}>Creates the teammate only. You choose what it can use.</Text>}
    </View>
  );
}
const s = StyleSheet.create({
  body: { gap: 4, paddingBottom: 6 }, section: { ...font.section, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }, grow: { flex: 1, minWidth: 0 },
  name: { ...font.row }, detail: { ...font.footnote },
});
