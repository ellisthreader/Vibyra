import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme';
import { kindName } from '../../scaffold/kinds';
import { searchTemplates } from '../../scaffold/search';
import { missingTools } from '../../scaffold/templates';
import type { ProjectKind } from '../../scaffold/types';
import { Group } from '../../settings/SettingsRows';
import { Icon } from '../primitives';
import { StackRow } from './StackRow';
import { WizardFooter } from './WizardFooter';

/**
 * Every stack Vibyra can start, searchable: the way out of "my framework is
 * not under the kind I picked". Each row says where it is filed, so choosing
 * from here is not a leap in the dark.
 */
export function StackBrowser({ kind, tools, selected, onChoose, onBack }: {
  kind: ProjectKind | null; tools: Record<string, boolean>; selected: string | null;
  onChoose: (templateId: string | null) => void; onBack: () => void;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchTemplates(query), [query]);
  return <>
    <View style={s.searchWrap}>
      <View style={[s.search, { backgroundColor: colors.elevated }]}>
        <Icon name="search-outline" size={17} color={colors.muted} />
        <TextInput value={query} onChangeText={setQuery} autoFocus autoCapitalize="none" autoCorrect={false}
          accessibilityLabel="Search every stack" placeholder="Search every stack — Laravel, Godot, FastAPI…"
          placeholderTextColor={colors.muted} style={[s.searchInput, { color: colors.text }]} />
      </View>
    </View>
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {results.length > 0
        ? <Group inset={16}>
          {results.map(entry => <StackRow key={entry.id} entry={entry} missing={missingTools(entry, tools)}
            kindLabel={kindName(entry.kinds[0]!)} selected={selected === entry.id} onPick={() => onChoose(entry.id)} />)}
        </Group>
        : <Text style={[s.empty, { color: colors.muted }]}>
          {`Nothing matches “${query.trim()}”. Skip the question and Vibyra will make the folder — you can set the project up however you like from a terminal in it.`}
        </Text>}
    </ScrollView>
    <WizardFooter quiet={[
      { title: kind ? `Back to ${kindName(kind).toLowerCase()} stacks` : 'Back', onPress: onBack },
      { title: 'Skip — just make a folder', onPress: () => onChoose(null) },
    ]} />
  </>;
}
const s = StyleSheet.create({
  searchWrap: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  search: { minHeight: 44, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  searchInput: { flex: 1, minHeight: 44, fontSize: 15 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 20 },
  empty: { fontSize: 14, lineHeight: 21, paddingHorizontal: 4, paddingTop: 8 },
});
