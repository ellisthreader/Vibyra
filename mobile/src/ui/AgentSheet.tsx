import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { CompanyGroup } from './CompanyGroup';
import { groupCompanies, matches, SEARCH_LIMIT } from './modelGroups';
import { Button, Icon } from './primitives';
import { Sheet } from './Sheet';
import { AUTO } from './agents';
import type { VibesModel } from '../vibes/types';

export function AgentSheet({ visible, onClose, selection, onSelect, models, paid, onUpgrade }: {
  visible: boolean; onClose(): void; selection: string; onSelect(id: string): void;
  models: VibesModel[]; paid: boolean; onUpgrade?(): void;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  // A locked model is not a choice, so tapping one says what would unlock it
  // rather than selecting something that would be refused at send time.
  const [blocked, setBlocked] = useState<VibesModel | null>(null);
  // A model with no live OpenRouter price cannot be quoted, so it is not offered.
  // If pricing is unavailable altogether the catalogue still shows.
  const offered = useMemo(() => (models.some(model => model.available) ? models.filter(model => model.available) : models), [models]);
  const search = query.trim().toLowerCase();
  // One clock for the whole sheet, so every "New" badge agrees and no row
  // re-renders merely because time passed while it was open.
  const now = useMemo(() => Date.now(), [visible]);
  useEffect(() => { if (!visible) setBlocked(null); }, [visible]);
  // The cap is applied before grouping: a one-letter search matches hundreds of
  // models, and the sheet mounts every row it is handed.
  const companies = useMemo(() => groupCompanies(search
    ? offered.filter(model => matches(model, search)).slice(0, SEARCH_LIMIT) : offered, now), [offered, search, now]);
  const choose = (id: string) => { onSelect(id); setQuery(''); onClose(); };
  return <Sheet title="Choose your AI" visible={visible} onClose={onClose} footer={blocked && (
    <View style={s.blocked}>
      <View style={[s.blockedIcon, { backgroundColor: colors.accentSoft }]}>
        <Icon name="lock-closed" size={17} color={colors.accent} /></View>
      <View style={s.text}>
        <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{blocked.name}</Text>
        <Text numberOfLines={2} style={[s.detail, { color: colors.muted }]}>Included with a membership</Text>
      </View>
      {onUpgrade && <Button title="See plans" onPress={() => { setBlocked(null); onClose(); onUpgrade(); }} />}
    </View>)}>
    {offered.length > 8 && <View style={[s.search, { backgroundColor: colors.elevated }]}>
      <Icon name="search-outline" size={18} color={colors.muted} />
      <TextInput value={query} onChangeText={setQuery} accessibilityLabel="Search AI models" placeholder="Search models"
        placeholderTextColor={colors.muted} autoCorrect={false} style={[s.searchInput, { color: colors.text }]} /></View>}
    {!search && <Pressable accessibilityRole="radio" accessibilityLabel="Auto" aria-checked={selection === AUTO}
      accessibilityState={{ checked: selection === AUTO }} onPress={() => choose(AUTO)}
      style={({ pressed }) => [s.company, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
      <View style={[s.auto, { backgroundColor: colors.accentSoft }]}><Icon name="sparkles" size={19} color={colors.accent} /></View>
      <View style={s.text}><Text style={[s.name, { color: colors.text }]}>Auto</Text>
        <Text style={[s.detail, { color: colors.muted }]}>Chosen for you.</Text></View>
      {selection === AUTO && <Icon name="checkmark" size={20} color={colors.accent} />}
    </Pressable>}
    {companies.map(company => <CompanyGroup key={company.vendor} company={company} selection={selection} paid={paid} now={now}
      // Searching opens every company that still has a match, so results are never hidden.
      expanded={Boolean(search) || open === company.vendor}
      onToggle={() => setOpen(open === company.vendor ? null : company.vendor)} onSelect={choose}
      onLocked={setBlocked} />)}
    {search && !companies.length && <Text style={[s.hint, { color: colors.muted }]}>No model matches “{query.trim()}”.</Text>}
  </Sheet>;
}
const s = StyleSheet.create({
  hint: { fontSize: 14, lineHeight: 21 },
  search: { minHeight: 46, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  searchInput: { flex: 1, minHeight: 46, fontSize: 15, outlineWidth: 0 },
  company: { minHeight: 68, paddingVertical: 12, paddingHorizontal: 13, flexDirection: 'row', gap: 13, alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 },
  auto: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 4 }, name: { fontSize: 15, fontWeight: '500', flexShrink: 1 },
  detail: { fontSize: 12, lineHeight: 17 },
  blocked: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  blockedIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
