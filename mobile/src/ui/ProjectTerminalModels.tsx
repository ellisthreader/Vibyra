import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { AgentMark } from './AgentRow';
import { ModelLogo } from './BrandLogo';
import { brandFor } from './brands';
import { font } from './font';
import { Hint, Icon } from './primitives';
import { InlineModelPicker, type InlinePickerCompany } from '../vibes/InlineModelPicker';
import type { TerminalModel } from './types';

export type TerminalChoice = { id: string; name: string; kind: 'shell' | 'codex' | 'claude'; model?: TerminalModel };
export const shellChoice: TerminalChoice = { id: 'shell', name: 'Plain terminal', kind: 'shell' };
export const modelChoice = (model: TerminalModel): TerminalChoice => ({ ...model, model });
export const defaultChoices: TerminalChoice[] = [
  { id: 'codex', name: 'Codex', kind: 'codex' }, { id: 'claude', name: 'Claude Code', kind: 'claude' },
];

export function ProjectTerminalModels({ models, supported, selected, disabled, loading, error, choose, refresh, onPickingChange }: {
  models: TerminalModel[]; supported: boolean; selected?: TerminalChoice; disabled: boolean;
  loading: boolean; error: string | null;
  choose(choice: TerminalChoice): void; refresh(): void;
  onPickingChange(open: boolean): void;
}) {
  const { colors } = useTheme();
  const [more, setMore] = useState(false);
  const showPicker = (open: boolean) => { setMore(open); onPickingChange(open); };
  const companies = models.reduce<InlinePickerCompany[]>((groups, model) => {
    const vendor = model.id.includes('/') ? model.id.split('/')[0] : model.kind === 'claude' ? 'anthropic' : 'openai';
    let company = groups.find(group => group.vendor === vendor);
    if (!company) { company = { vendor, name: brandFor(vendor).name, models: [] }; groups.push(company); }
    company.models.push({ id: model.id, name: model.name, fresh: model.isNew });
    return groups;
  }, []);
  const featured = supported ? ['codex', 'claude'].flatMap(kind => {
    const model = models.find(item => item.kind === kind);
    return model ? [modelChoice(model)] : [];
  }) : defaultChoices;
  // Keep a model selected from the full list visible in its provider's card.
  const cards = featured.map(item => selected?.model && selected.kind === item.kind ? selected : item);
  if (more) return <InlineModelPicker selection={selected?.id ?? ''} companies={companies} automatic={false}
    disabled={disabled || loading} emptyLabel={loading ? 'Loading models…' : 'No computer models available.'}
    onClose={() => showPicker(false)} onSelect={id => { const model = models.find(item => item.id === id); if (model) choose(modelChoice(model)); }}
    notice={error ? <View><Hint error>{error}</Hint><Pressable accessibilityRole="button" accessibilityLabel="Refresh computer models" onPress={refresh} style={s.row}>
      <Text style={[font.row, { color: colors.accent }]}>Try again</Text></Pressable></View> : undefined} />;
  return <View style={s.section}>
    <View style={s.cards}>
      {cards.map(choice => {
        const active = selected?.id === choice.id;
        return <Pressable key={choice.kind} accessibilityRole="radio" accessibilityLabel={`Select ${choice.name}`}
          aria-checked={active} accessibilityState={{ checked: active, disabled }} disabled={disabled} onPress={() => choose(choice)}
          style={({ pressed }) => [s.card, { borderColor: active ? colors.accent : colors.border,
            backgroundColor: active ? colors.accentSoft : colors.surface, opacity: pressed ? 0.7 : 1 }]}>
          <View style={s.top}>
            {choice.model ? <ModelLogo id={choice.id} size={42} /> : <AgentMark kind={choice.kind} size={42} />}
            {active && <Icon name="checkmark-circle" size={20} color={colors.accent} />}
          </View>
          <Text style={[font.headline, { color: colors.text }]}>{choice.name}</Text>
          <Text style={[font.footnote, { color: colors.muted }]}>{choice.kind === 'codex' ? 'Codex' : 'Claude Code'}</Text>
        </Pressable>;
      })}
    </View>
    {supported && models.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="More models" disabled={disabled}
      onPress={() => showPicker(true)} style={s.row}>
      <Icon name="grid-outline" size={18} color={colors.muted} />
      <Text style={[s.label, { color: colors.text }]}>More models</Text>
      <Text style={[font.footnote, { color: colors.muted }]}>{models.length}</Text>
      <Icon name="chevron-forward" size={15} color={colors.muted} />
    </Pressable>}
    <Pressable accessibilityRole="radio" accessibilityLabel="Select plain terminal" aria-checked={selected?.kind === 'shell'} accessibilityState={{ checked: selected?.kind === 'shell', disabled }}
      disabled={disabled} onPress={() => choose(shellChoice)} style={s.row}>
      <Icon name="terminal-outline" size={19} color={colors.muted} />
      <Text style={[s.label, { color: colors.text }]}>Plain terminal</Text>
      <Text style={[font.footnote, { color: colors.muted }]}>No AI</Text>
      {selected?.kind === 'shell' && <Icon name="checkmark-circle" size={20} color={colors.accent} />}
    </Pressable>
  </View>;
}
const s = StyleSheet.create({
  section: { gap: 4 }, cards: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, minWidth: 0, borderWidth: 1.5, borderRadius: 18, padding: 16, gap: 5 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  row: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  label: { ...font.row, flex: 1 },
});
