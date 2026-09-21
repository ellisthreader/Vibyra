import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { VibesModel } from '../vibes/types';
import { AgentRow, AGENT_TILE } from './AgentRow';
import { BrandLogo } from './BrandLogo';
import { vendorOf } from './brands';
import { isNew, PREVIEW, type Company } from './modelGroups';

/**
 * One company the phone can run, as a row that opens to its models, drawn the
 * same way as the agents above it rather than as the picker's bordered card.
 * A model is a start, not a selection, so its row is a button. A model a free
 * account cannot spend on says so in its line and asks for a membership when
 * tapped, so nobody starts something that would be refused.
 */
export function CompanyRow({ company, expanded, onToggle, onStart, paid, onLocked, busy, now, disabled }: {
  company: Company; expanded: boolean; onToggle(): void; onStart(id: string): void;
  paid: boolean; onLocked(model: VibesModel): void; busy: string | null; now: number;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [all, setAll] = useState(false);
  useEffect(() => { if (!expanded) setAll(false); }, [expanded]);
  const shown = all ? company.models : company.models.slice(0, PREVIEW);
  const hidden = company.models.length - shown.length;
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={company.name} accessibilityState={{ expanded, disabled }} aria-expanded={expanded}
      disabled={disabled} onPress={onToggle} style={({ pressed }) => [s.row, { backgroundColor: pressed ? colors.elevated : 'transparent' }]}>
      <BrandLogo vendor={company.vendor} size={AGENT_TILE} />
      <View style={s.text}>
        <View style={s.nameRow}><Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{company.name}</Text>
          {company.newCount > 0 && <Text style={[s.badge, { color: colors.accent, backgroundColor: colors.accentSoft }]}>New</Text>}</View>
        <Text numberOfLines={1} style={[s.detail, { color: colors.muted }]}>
          {company.models.length === 1 ? '1 model' : `${company.models.length} models`}</Text>
      </View>
      <View style={[s.chevron, expanded && s.up]}><Text style={[s.chevronText, { color: colors.muted }]}>⌄</Text></View>
    </Pressable>
    {expanded && <View style={s.models}>
      {shown.map(model => {
        const locked = !model.trial && !paid;
        return <AgentRow key={model.id} name={`${model.name}${isNew(model, now) ? ' · New' : ''}`} busy={busy === model.id} disabled={disabled}
          detail={locked ? 'Included with a membership' : model.blurb || company.name}
          mark={<View style={locked && s.dim}><BrandLogo vendor={vendorOf(model.id)} size={32} /></View>}
          onPress={() => (locked ? onLocked(model) : onStart(model.id))} />;
      })}
      {hidden > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`Show all ${company.models.length} ${company.name} models`}
        disabled={disabled} accessibilityState={{ disabled }} onPress={() => setAll(true)} style={({ pressed }) => [s.more, { opacity: pressed ? 0.6 : 1 }]}>
        <Text style={[s.moreText, { color: colors.accent }]}>Show {hidden} more</Text>
      </Pressable>}
    </View>}
  </View>;
}
const s = StyleSheet.create({
  row: { minHeight: 62, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 13 },
  text: { flex: 1, gap: 3 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15.5, fontWeight: '600', letterSpacing: -0.2, flexShrink: 1 },
  badge: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  detail: { fontSize: 13, lineHeight: 17 },
  chevron: { width: 16, alignItems: 'center' }, up: { transform: [{ rotate: '180deg' }] },
  chevronText: { fontSize: 18, lineHeight: 18, marginTop: -6 },
  models: { paddingLeft: 24, paddingVertical: 2 },
  more: { minHeight: 44, paddingLeft: 65, justifyContent: 'center' },
  moreText: { fontSize: 13, fontWeight: '500' },
  dim: { opacity: 0.45 },
});
