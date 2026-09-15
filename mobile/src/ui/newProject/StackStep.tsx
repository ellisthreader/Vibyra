import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { missingTools, templatesForKind } from '../../scaffold/templates';
import type { ProjectKind } from '../../scaffold/types';
import { Group } from '../../settings/SettingsRows';
import { Icon } from '../primitives';
import { StackBrowser } from './StackBrowser';
import { StackRow } from './StackRow';
import { WizardFooter } from './WizardFooter';

/**
 * Question two. Rows, not tiles: the blurb is what picks the stack, and a
 * missing toolchain has to be readable rather than merely greyed out. The
 * first row is the safe default for the kind. "Other…" opens the whole
 * catalog, inside the same card because it is one of the answers to this
 * question rather than a separate control.
 */
export function StackStep({ kind, tools, selected, browsing, onChoose, onBrowse }: {
  kind: ProjectKind | null; tools: Record<string, boolean>; selected: string | null; browsing: boolean;
  onChoose: (templateId: string | null) => void; onBrowse: (on: boolean) => void;
}) {
  const { colors } = useTheme();
  if (browsing) return <StackBrowser kind={kind} tools={tools} selected={selected} onChoose={onChoose} onBack={() => onBrowse(false)} />;
  const entries = kind ? templatesForKind(kind) : [];
  return <>
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Group inset={16}>
        {entries.map(entry => <StackRow key={entry.id} entry={entry} missing={missingTools(entry, tools)}
          selected={selected === entry.id} onPick={() => onChoose(entry.id)} />)}
        <Pressable accessibilityRole="button" accessibilityLabel="Other stacks" onPress={() => onBrowse(true)}
          style={({ pressed }) => [s.other, { backgroundColor: pressed ? colors.elevated : 'transparent' }]}>
          <View style={s.text}>
            <Text style={[s.otherTitle, { color: colors.accent }]}>Other…</Text>
            <Text style={[s.blurb, { color: colors.muted }]}>Search every stack Vibyra can start, whatever it is filed under</Text>
          </View>
          <Icon name="chevron-forward" size={15} color={colors.accent} />
        </Pressable>
      </Group>
    </ScrollView>
    <WizardFooter quiet={[{ title: 'Skip — just make a folder', onPress: () => onChoose(null) }]} />
  </>;
}
const s = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 },
  other: { minHeight: 62, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  otherTitle: { fontSize: 15.5, fontWeight: '600', letterSpacing: -0.2 },
  blurb: { fontSize: 13, lineHeight: 18 },
});
