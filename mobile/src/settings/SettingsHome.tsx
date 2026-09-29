import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { useSheetBottomInset } from '../ui/OverlaySheet';
import type { WorkspaceModel } from '../ui/types';
import type { SettingsNav, SettingsRoutes } from './pages';
import { searchSettings, visibleSettingsCategories } from './settingsSearch';
import { GuestHeader } from './GuestHeader';
import { SettingsTileIcon, tileColors } from './SettingsTileIcon';

/** Mac Settings' tile navigation and find field, stacked for an iPhone. */
export function SettingsHome({ workspace, nav }: {
  workspace: WorkspaceModel; nav: SettingsNav; routes: SettingsRoutes;
}) {
  const { colors } = useTheme();
  const bottom = useSheetBottomInset();
  const [query, setQuery] = useState('');
  const guest = !workspace.account;
  const results = searchSettings(query, !guest, !!workspace.demo);
  const shownCategories = visibleSettingsCategories(!guest);
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { paddingBottom: bottom + 24 }]}>
    {guest && <View style={s.guest}>
      <GuestHeader onSignIn={() => nav.signIn('login')} onSignUp={() => nav.signIn('signup')} />
    </View>}
    <View style={[s.find, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
      <Text style={[s.magnifier, { color: colors.muted }]}>⌕</Text>
      <TextInput placeholder="Find a setting" accessibilityLabel="Find a setting"
        placeholderTextColor={colors.muted} value={query} onChangeText={setQuery}
        autoCorrect={false} style={[s.field, { color: colors.text }]} />
      {!!query && <Text accessibilityRole="button" onPress={() => setQuery('')}
        style={[s.clear, { color: colors.muted }]}>Clear</Text>}
    </View>
    {query.trim() ? <View style={[s.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {results.length ? results.map((hit, index) => <Pressable key={`${hit.label}:${index}`}
        accessibilityRole="button" onPress={() => { setQuery(''); nav.push(hit.page); }}
        style={[s.hit, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
        <Text style={[s.name, { color: colors.text }]}>{hit.label}</Text>
        <Text style={[s.detail, { color: colors.muted }]}>{hit.category}</Text>
      </Pressable>) : <Text style={[s.empty, { color: colors.muted }]}>No setting matches.</Text>}
    </View> : shownCategories.map(category => {
      const detail = guest && category.id === 'general' && !workspace.demo
        ? 'Appearance and privacy' : category.detail;
      return <View key={category.id} style={category.id === 'advanced' ? s.separate : undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${category.label}, ${detail}`}
        onPress={() => nav.push(category.page)} style={({ pressed }) => [s.category,
          { backgroundColor: pressed ? colors.elevated : colors.surface, borderColor: colors.border }]}>
        <View style={[s.tile, { backgroundColor: tileColors[category.id] }]}>
          <SettingsTileIcon name={category.id} />
        </View>
        <View style={s.words}>
          <Text style={[s.name, { color: colors.text }]}>{category.label}</Text>
          <Text style={[s.detail, { color: colors.muted }]}>{detail}</Text>
        </View>
        <Text style={[s.chevron, { color: colors.muted }]}>›</Text>
      </Pressable>
    </View>; })}
  </ScrollView>;
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 10, gap: 8 },
  guest: { marginBottom: 3 },
  find: { height: 42, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 8 },
  magnifier: { fontSize: 24, marginRight: 7 },
  field: { flex: 1, fontSize: 15, paddingVertical: 0 },
  clear: { fontSize: 13 },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  hit: { paddingHorizontal: 16, paddingVertical: 11 },
  empty: { padding: 16, fontSize: 14 },
  category: { minHeight: 63, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 29, height: 29, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  detail: { fontSize: 12 },
  chevron: { fontSize: 25, lineHeight: 27 },
  separate: { marginTop: 10 },
});
