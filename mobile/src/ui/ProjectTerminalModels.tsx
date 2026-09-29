import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { AgentMark } from './AgentRow';
import { ModelLogo } from './BrandLogo';
import { brandFor, vendorOf } from './brands';
import { font } from './font';
import { Hint, Icon } from './primitives';
import { InlineModelPicker, type InlinePickerCompany } from '../vibes/InlineModelPicker';
import type { SessionKind, TerminalModel } from './types';
import { agentName } from './agents';

export type TerminalChoice = { id: string; name: string; kind: SessionKind; model?: TerminalModel };
export const shellChoice: TerminalChoice = { id: 'shell', name: 'Plain terminal', kind: 'shell' };
export const modelChoice = (model: TerminalModel): TerminalChoice => ({ ...model, model });
export const defaultChoices: TerminalChoice[] = [
  { id: 'codex', name: 'Codex', kind: 'codex' }, { id: 'claude', name: 'Claude Code', kind: 'claude' },
];

export function ProjectTerminalModels({ models, supported, selected, disabled, loading, error, choose, refresh, onPickingChange, onIntegrations, automatic, chooseAuto }: {
  automatic?: boolean; chooseAuto?(): void;
  models: TerminalModel[]; supported: boolean; selected?: TerminalChoice; disabled: boolean;
  loading: boolean; error: string | null;
  choose(choice: TerminalChoice): void; refresh(): void;
  onPickingChange(open: boolean): void;
  onIntegrations?(): void;
}) {
  const { colors } = useTheme();
  const [more, setMore] = useState(false);
  const showPicker = (open: boolean) => { setMore(open); onPickingChange(open); };
  const companies = models.reduce<InlinePickerCompany[]>((groups, model) => {
    const vendor = model.id.includes('/') ? vendorOf(model.id) : model.kind === 'claude' ? 'anthropic' : model.kind === 'gemini' ? 'google' : model.kind === 'codex' ? 'openai' : model.kind;
    let company = groups.find(group => group.vendor === vendor);
    if (!company) { company = { vendor, name: brandFor(vendor).name, models: [] }; groups.push(company); }
    company.models.push({ id: model.id, name: model.name, fresh: model.isNew, detail: 'Your AI account' });
    return groups;
  }, []);
  const featured = supported ? [...new Set(models.map(model => model.kind))].slice(0, 2).flatMap(kind => {
    const model = models.find(item => item.kind === kind);
    return model ? [modelChoice(model)] : [];
  }) : defaultChoices;
  // Keep a model selected from the full list visible in its provider's card.
  const cards = featured.map(item => selected?.model && selected.kind === item.kind ? selected : item);
  if (selected?.model && !cards.some(item => item.id === selected.id)) cards.splice(0, 1, selected);
  if (more) return <View style={s.picker}><InlineModelPicker presentation="page" selection={automatic ? 'auto' : selected?.id ?? ''} companies={companies} automatic={!!chooseAuto} automaticLabel="Vibyra Auto" automaticDetail="Picks the model and effort to match your message."
    disabled={disabled || loading} emptyLabel={loading ? 'Loading models…' : 'No computer models available.'}
    onClose={() => showPicker(false)} onSelect={id => { if (id === 'auto') { chooseAuto?.(); return; } const model = models.find(item => item.id === id); if (model) choose(modelChoice(model)); }}
    notice={error ? <View><Hint error>{error}</Hint><Pressable accessibilityRole="button" accessibilityLabel="Refresh computer models" onPress={refresh} style={s.row}>
      <Text style={[font.row, { color: colors.accent }]}>Try again</Text></Pressable></View> : undefined} />
    {onIntegrations && <Pressable accessibilityRole="link" accessibilityLabel="Connect AI accounts in Settings, Accounts"
      disabled={disabled} onPress={onIntegrations} style={s.connect}>
      <Text style={[font.caption, { color: colors.muted, textAlign: 'center' }]}>Connect your AI accounts in{' '}
        <Text style={{ color: colors.accent }}>Settings → Accounts</Text>.</Text>
    </Pressable>}
  </View>;
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
          <Text style={[font.footnote, { color: colors.muted }]}>{agentName(choice.kind)}</Text>
        </Pressable>;
      })}
    </View>
    {companies.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="More models" disabled={disabled}
      onPress={() => showPicker(true)} style={[s.row, automatic && { backgroundColor: colors.accentSoft, borderRadius: 12, paddingHorizontal: 12 }]}>
      <Icon name="grid-outline" size={18} color={colors.muted} />
      <Text style={[s.label, { color: colors.text }]}>More models</Text>
      <Text style={[font.footnote, { color: colors.muted }]}>{automatic ? 'Vibyra Auto' : companies.reduce((count, company) => count + company.models.length, 0)}</Text>
      {automatic && <Icon name="checkmark-circle" size={18} color={colors.accent} />}
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
  picker: { flex: 1, minHeight: 0 }, connect: { minHeight: 44, justifyContent: 'center', paddingTop: 8 },
  section: { gap: 4 }, cards: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, minWidth: 0, borderWidth: 1.5, borderRadius: 18, padding: 16, gap: 5 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  row: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  label: { ...font.row, flex: 1 },
});
