import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandLogo } from './BrandLogo';
import { brandFor, vendorOf } from './brands';
import { Icon } from './primitives';
import { Sheet } from './Sheet';
import { AUTO, isNewModel } from './agents';
import type { VibesModel } from '../vibes/types';

// Companies keep the order the catalogue gave them, so the strongest families
// stay at the top and every model sits under the vendor that actually serves it
// on OpenRouter.
function byCompany(models: VibesModel[]) {
  const companies = new Map<string, VibesModel[]>();
  for (const model of models) {
    const vendor = vendorOf(model.id);
    const group = companies.get(vendor);
    if (group) group.push(model); else companies.set(vendor, [model]);
  }
  return [...companies].map(([vendor, list]) => ({ vendor, name: brandFor(vendor).name, models: list }));
}

function ModelRow({ model, selected, onSelect, paid }: {
  model: VibesModel; selected: boolean; onSelect(id: string): void; paid: boolean;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="radio" accessibilityLabel={`${brandFor(vendorOf(model.id)).name} ${model.name}`}
    aria-checked={selected} accessibilityState={{ checked: selected }} onPress={() => onSelect(model.id)}
    style={({ pressed }) => [s.model, { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
    <View style={s.text}>
      <View style={s.nameRow}><Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{model.name}</Text>
        {isNewModel(model) && <Text style={[s.badge, { color: colors.accent, backgroundColor: colors.accentSoft }]}>New</Text>}</View>
      {!!model.blurb && <Text numberOfLines={2} style={[s.detail, { color: colors.muted }]}>{model.blurb}</Text>}
    </View>
    {!model.trial && !paid && <Text style={[s.detail, { color: colors.muted }]}>Paid Vibes</Text>}
    {selected && <Icon name="checkmark" size={20} color={colors.accent} />}
  </Pressable>;
}

export function AgentSheet({ visible, onClose, selection, onSelect, models, paid }: {
  visible: boolean; onClose(): void; selection: string; onSelect(id: string): void;
  models: VibesModel[]; paid: boolean;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  // A model with no live OpenRouter price cannot be quoted, so it is not offered.
  // If pricing is unavailable altogether the catalogue still shows.
  const offered = useMemo(() => (models.some(model => model.available) ? models.filter(model => model.available) : models), [models]);
  const search = query.trim().toLowerCase();
  const companies = useMemo(() => byCompany(search ? offered.filter(model =>
    `${brandFor(vendorOf(model.id)).name} ${model.name}`.toLowerCase().includes(search)) : offered), [offered, search]);
  const choose = (id: string) => { onSelect(id); setQuery(''); onClose(); };
  return <Sheet title="Choose your AI" visible={visible} onClose={onClose}>
    <Text style={[s.hint, { color: colors.muted }]}>Auto picks for you. Or open a company to see every model it runs on OpenRouter.</Text>
    {offered.length > 8 && <View style={[s.search, { backgroundColor: colors.elevated }]}>
      <Icon name="search-outline" size={18} color={colors.muted} />
      <TextInput value={query} onChangeText={setQuery} accessibilityLabel="Search AI models" placeholder="Search models"
        placeholderTextColor={colors.muted} autoCorrect={false} style={[s.searchInput, { color: colors.text }]} /></View>}
    {!search && <Pressable accessibilityRole="radio" accessibilityLabel="Auto" aria-checked={selection === AUTO}
      accessibilityState={{ checked: selection === AUTO }} onPress={() => choose(AUTO)}
      style={({ pressed }) => [s.company, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
      <View style={[s.auto, { backgroundColor: colors.accentSoft }]}><Icon name="sparkles" size={19} color={colors.accent} /></View>
      <View style={s.text}><Text style={[s.name, { color: colors.text }]}>Auto</Text>
        <Text style={[s.detail, { color: colors.muted }]}>Vibyra chooses the right model for what you ask.</Text></View>
      {selection === AUTO && <Icon name="checkmark" size={20} color={colors.accent} />}
    </Pressable>}
    {companies.map(company => {
      // Searching opens every company that still has a match, so results are never hidden.
      const expanded = Boolean(search) || open === company.vendor;
      const chosen = company.models.some(model => model.id === selection);
      return <View key={company.vendor} style={[s.group, { borderColor: chosen ? colors.accent : colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={company.name}
          accessibilityState={{ expanded }} aria-expanded={expanded}
          onPress={() => setOpen(open === company.vendor ? null : company.vendor)}
          style={({ pressed }) => [s.company, { opacity: pressed ? 0.6 : 1 }]}>
          <BrandLogo vendor={company.vendor} />
          <View style={s.text}><Text style={[s.name, { color: colors.text }]}>{company.name}</Text>
            <Text style={[s.detail, { color: colors.muted }]}>{company.models.length === 1 ? '1 model'
              : `${company.models.length} models`}{chosen ? ' · in use' : ''}</Text></View>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.muted} />
        </Pressable>
        {expanded && company.models.map(model => <ModelRow key={model.id} model={model} paid={paid}
          selected={selection === model.id} onSelect={choose} />)}
      </View>;
    })}
    {search && !companies.length && <Text style={[s.hint, { color: colors.muted }]}>No model matches “{query.trim()}”.</Text>}
    <Text style={[s.footnote, { color: colors.muted }]}>Every model runs through OpenRouter on one Vibes balance.</Text>
  </Sheet>;
}
const s = StyleSheet.create({
  hint: { fontSize: 14, lineHeight: 21 },
  search: { minHeight: 46, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  searchInput: { flex: 1, minHeight: 46, fontSize: 15, outlineWidth: 0 },
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden', marginTop: -8 },
  company: { minHeight: 68, paddingVertical: 12, paddingHorizontal: 13, flexDirection: 'row', gap: 13, alignItems: 'center' },
  auto: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  model: { minHeight: 60, paddingVertical: 11, paddingLeft: 64, paddingRight: 13, flexDirection: 'row',
    gap: 10, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, gap: 4 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '500', flexShrink: 1 },
  badge: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  detail: { fontSize: 12, lineHeight: 17 }, footnote: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
});
