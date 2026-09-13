import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandLogo, ModelLogo } from './BrandLogo';
import { Icon } from './primitives';
import { isNew, PREVIEW, type Company } from './modelGroups';
import type { VibesModel } from '../vibes/types';

/**
 * One model. A model a free account cannot spend its trial credit on reads as
 * locked rather than as an ordinary row with a price beside it: the mark and the
 * name step back, and a lock stands where the tick would. Choosing one opens the
 * plans instead of selecting it, so nobody picks a model that would be refused at
 * send time.
 */
function ModelRow({ model, selected, onSelect, locked, onLocked, now }: {
  model: VibesModel; selected: boolean; onSelect(id: string): void;
  locked: boolean; onLocked(): void; now: number;
}) {
  const { colors } = useTheme();
  const fresh = isNew(model, now);
  return <Pressable accessibilityRole="radio"
    accessibilityLabel={`${model.name}${fresh ? ', new' : ''}${locked ? ', membership needed' : ''}`}
    aria-checked={selected} accessibilityState={{ checked: selected, disabled: locked }}
    onPress={() => (locked ? onLocked() : onSelect(model.id))}
    style={({ pressed }) => [s.model, { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
    {/* The model's own generated artwork where one exists, its company's mark otherwise. */}
    <View style={locked && s.dim}><ModelLogo id={model.id} size={30} /></View>
    <View style={s.text}>
      <View style={s.nameRow}>
        <Text numberOfLines={1} style={[s.name, { color: locked ? colors.muted : colors.text }]}>{model.name}</Text>
        {fresh && <Text style={[s.badge, { color: colors.accent, backgroundColor: colors.accentSoft }]}>New</Text>}</View>
      {!!model.blurb && <Text numberOfLines={2} style={[s.detail, { color: colors.muted }]}>{model.blurb}</Text>}
    </View>
    {locked ? <View style={[s.lock, { backgroundColor: colors.elevated }]}>
      <Icon name="lock-closed" size={12} color={colors.muted} /></View>
      : selected && <Icon name="checkmark" size={20} color={colors.accent} />}
  </Pressable>;
}

/**
 * One company, collapsed to a single row until it is opened. A company with many
 * models opens on its best few: OpenAI and Qwen each ship dozens, and mounting
 * every one of them the moment a card is tapped is what makes a sheet stutter.
 */
export function CompanyGroup({ company, selection, expanded, onToggle, onSelect, paid, onLocked, now }: {
  company: Company; selection: string; expanded: boolean; onToggle(): void;
  onSelect(id: string): void; paid: boolean; onLocked(model: VibesModel): void; now: number;
}) {
  const { colors } = useTheme();
  const [all, setAll] = useState(false);
  // Closing a company forgets that it was fully open, so reopening OpenAI does
  // not silently mount forty rows again.
  useEffect(() => { if (!expanded) setAll(false); }, [expanded]);
  const chosen = company.models.some(model => model.id === selection);
  const shown = all ? company.models : company.models.slice(0, PREVIEW);
  const hidden = company.models.length - shown.length;
  return <View style={[s.group, { borderColor: chosen ? colors.accent : colors.border }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={company.name}
      accessibilityState={{ expanded }} aria-expanded={expanded} onPress={onToggle}
      style={({ pressed }) => [s.company, { opacity: pressed ? 0.6 : 1 }]}>
      <BrandLogo vendor={company.vendor} />
      <View style={s.text}>
        <View style={s.nameRow}><Text style={[s.name, { color: colors.text }]}>{company.name}</Text>
          {company.newCount > 0 && <Text style={[s.badge, { color: colors.accent, backgroundColor: colors.accentSoft }]}>New</Text>}</View>
        <Text style={[s.detail, { color: colors.muted }]}>{company.models.length === 1 ? '1 model'
          : `${company.models.length} models`}{chosen ? ' · in use' : ''}</Text></View>
      <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.muted} />
    </Pressable>
    {/* Buying Vibes unlocks the catalogue, so a paid balance clears every lock. */}
    {expanded && shown.map(model => <ModelRow key={model.id} model={model} now={now}
      locked={!model.trial && !paid} onLocked={() => onLocked(model)}
      selected={selection === model.id} onSelect={onSelect} />)}
    {expanded && hidden > 0 && <Pressable accessibilityRole="button"
      accessibilityLabel={`Show all ${company.models.length} ${company.name} models`} onPress={() => setAll(true)}
      style={({ pressed }) => [s.more, { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[s.moreText, { color: colors.accent }]}>Show {hidden} more</Text>
    </Pressable>}
  </View>;
}
const s = StyleSheet.create({
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden', marginTop: -8 },
  company: { minHeight: 68, paddingVertical: 12, paddingHorizontal: 13, flexDirection: 'row', gap: 13, alignItems: 'center' },
  model: { minHeight: 60, paddingVertical: 11, paddingLeft: 21, paddingRight: 13, flexDirection: 'row',
    gap: 12, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  more: { minHeight: 48, paddingLeft: 63, paddingRight: 13, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  moreText: { fontSize: 13, fontWeight: '500' },
  text: { flex: 1, gap: 4 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '500', flexShrink: 1 },
  badge: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  detail: { fontSize: 12, lineHeight: 17 },
  dim: { opacity: 0.45 },
  lock: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
