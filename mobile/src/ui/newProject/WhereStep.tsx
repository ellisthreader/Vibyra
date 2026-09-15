import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme';
import { abbreviateHome, resolveDestination } from '../../scaffold/destination';
import { Icon } from '../primitives';
import { MONO } from './mono';
import { WizardFooter } from './WizardFooter';

/**
 * The one question that cannot be skipped, so it is pre-filled and one tap
 * from done. The resolved path is shown while the name is typed. The folder
 * it goes inside is the computer's suggestion; Change reveals it as a field,
 * because a phone has no folder picker for a computer's disk.
 */
export function WhereStep({ name, parent, home, onName, onParent, onContinue }: {
  name: string; parent: string; home: string;
  onName: (name: string) => void; onParent: (parent: string) => void; onContinue: () => void;
}) {
  const { colors } = useTheme();
  const [editingParent, setEditingParent] = useState(false);
  const destination = resolveDestination(parent, name, home);
  const ready = !destination.error;
  return <>
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={[s.label, { color: colors.muted }]}>Project name</Text>
      <TextInput value={name} onChangeText={onName} autoFocus autoCapitalize="none" autoCorrect={false} spellCheck={false}
        maxLength={64} accessibilityLabel="Project name" returnKeyType="done" onSubmitEditing={() => { if (ready) onContinue(); }}
        style={[s.input, { color: colors.text, backgroundColor: colors.elevated }]} />
      <Text accessibilityRole="header" style={[s.label, s.later, { color: colors.muted }]}>Inside</Text>
      {editingParent
        ? <TextInput value={parent} onChangeText={onParent} autoFocus autoCapitalize="none" autoCorrect={false} spellCheck={false}
          accessibilityLabel="Folder to put the project in" placeholder="~/Projects" placeholderTextColor={colors.muted}
          style={[s.input, s.mono, { color: colors.text, backgroundColor: colors.elevated }]} />
        : <View style={[s.folder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Icon name="folder-outline" size={18} color={colors.muted} />
          <Text numberOfLines={1} style={[s.folderPath, s.mono, { color: colors.text }]}>{abbreviateHome(parent, home) || '…'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Change folder" onPress={() => setEditingParent(true)} hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
            <Text style={[s.change, { color: colors.accent }]}>Change</Text>
          </Pressable>
        </View>}
      <Text accessibilityLiveRegion="polite" style={[s.path, { color: destination.error ? colors.error : colors.muted }]}>
        {destination.error ?? `It will be created at ${abbreviateHome(destination.path, home)}`}
      </Text>
    </ScrollView>
    <WizardFooter primary={{ title: 'Continue', onPress: onContinue, disabled: !ready }} />
  </>;
}
const s = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2, marginLeft: 2, marginBottom: 8 },
  later: { marginTop: 22 },
  input: { minHeight: 50, fontSize: 16, borderRadius: 14, paddingHorizontal: 16 },
  mono: { fontFamily: MONO, fontSize: 14 },
  folder: { minHeight: 50, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10 },
  folderPath: { flex: 1 },
  change: { fontSize: 15, fontWeight: '600' },
  path: { fontSize: 13.5, lineHeight: 19, marginTop: 14, marginLeft: 2 },
});
