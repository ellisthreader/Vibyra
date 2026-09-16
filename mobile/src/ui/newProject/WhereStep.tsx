import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme';
import { abbreviateHome, resolveDestination } from '../../scaffold/destination';
import type { ProjectTemplate } from '../../scaffold/types';
import { Icon } from '../primitives';
import { MONO } from './mono';
import { StackMark } from './StackMark';
import { WizardFooter } from './WizardFooter';

/**
 * The one question that cannot be skipped, so it is pre-filled and one tap from
 * done. The name is the whole screen: a single large field, the way a document
 * is named, rather than a small box under a label among three other labels.
 *
 * Underneath it the folder reads as one sentence — the path in quiet type with
 * the new folder itself picked out — so where the project lands is checked at a
 * glance instead of parsed. The stacks chosen a moment ago are shown above it,
 * because by this screen it is easy to have forgotten which ones they were.
 */
export function WhereStep({ name, parent, home, stacks, onName, onParent, onContinue }: {
  name: string; parent: string; home: string;
  /** The stacks picked, to show what is about to be named. */
  stacks: ProjectTemplate[];
  onName: (name: string) => void; onParent: (parent: string) => void; onContinue: () => void;
}) {
  const { colors } = useTheme();
  const [editingParent, setEditingParent] = useState(false);
  const destination = resolveDestination(parent, name, home);
  const ready = !destination.error;
  const shown = abbreviateHome(destination.path, home);
  const cut = shown.lastIndexOf('/');
  return <>
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {stacks.length > 0 && <View style={s.stacks}>
        {stacks.map(entry => <View key={entry.id} style={[s.chip, { backgroundColor: colors.elevated }]}>
          <StackMark templateId={entry.id} kind={entry.kinds[0]!} size={17} />
          <Text numberOfLines={1} style={[s.chipText, { color: colors.muted }]}>{entry.name}</Text>
        </View>)}
      </View>}
      <TextInput value={name} onChangeText={onName} autoFocus autoCapitalize="none" autoCorrect={false} spellCheck={false}
        maxLength={64} accessibilityLabel="Project name" returnKeyType="done" selectTextOnFocus
        onSubmitEditing={() => { if (ready) onContinue(); }}
        style={[s.name, { color: colors.text }]} />
      <View style={[s.rule, { backgroundColor: ready ? colors.accent : colors.error }]} />
      {editingParent
        ? <TextInput value={parent} onChangeText={onParent} autoFocus autoCapitalize="none" autoCorrect={false} spellCheck={false}
          accessibilityLabel="Folder to put the project in" placeholder="~/Projects" placeholderTextColor={colors.muted}
          style={[s.folderInput, s.mono, { color: colors.text, backgroundColor: colors.elevated }]} />
        : <Pressable accessibilityRole="button" accessibilityLabel="Change folder" onPress={() => setEditingParent(true)}
          style={({ pressed }) => [s.folder, { opacity: pressed ? 0.6 : 1 }]}>
          <Icon name="folder-outline" size={16} color={colors.muted} />
          <Text numberOfLines={1} style={[s.path, s.mono, { color: colors.muted }]}>
            {cut > 0 ? shown.slice(0, cut + 1) : shown}
            <Text style={{ color: colors.text }}>{cut > 0 ? shown.slice(cut + 1) : ''}</Text>
          </Text>
          <Text style={[s.change, { color: colors.accent }]}>Change</Text>
        </Pressable>}
      {destination.error
        ? <Text accessibilityLiveRegion="polite" style={[s.error, { color: colors.error }]}>{destination.error}</Text>
        : null}
    </ScrollView>
    <WizardFooter primary={{ title: 'Continue', onPress: onContinue, disabled: !ready }} />
  </>;
}
const s = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  stacks: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 22 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 11,
    paddingVertical: 5, borderRadius: 999 },
  chipText: { fontSize: 12.5, fontWeight: '600', letterSpacing: -0.1 },
  // The field is the page: no box, no label, just the name at the size a title
  // is written at, with a rule under it that turns when the name cannot be used.
  name: { fontSize: 30, fontWeight: '700', letterSpacing: -0.8, paddingVertical: 4, paddingHorizontal: 0 },
  rule: { height: 2, borderRadius: 1, marginTop: 6 },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 18, minHeight: 34 },
  folderInput: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, marginTop: 16 },
  path: { flex: 1 },
  mono: { fontFamily: MONO, fontSize: 13 },
  change: { fontSize: 14.5, fontWeight: '600' },
  error: { fontSize: 13.5, lineHeight: 19, marginTop: 14 },
});
