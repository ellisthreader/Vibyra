import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { additionsFor, missingTools, templatesForKind } from '../../scaffold/templates';
import type { ProjectKind } from '../../scaffold/types';
import { Group } from '../../settings/SettingsRows';
import { Icon } from '../primitives';
import { StackBrowser } from './StackBrowser';
import { StackRow } from './StackRow';
import { WizardFooter } from './WizardFooter';

/**
 * Question two. Rows, not tiles: the blurb is what picks the stack, and a
 * missing toolchain has to be readable rather than merely greyed out.
 *
 * Two lists, because the answers are two different shapes. The first is the
 * stack that makes the project, and only one of those can be chosen — two
 * scaffolders cannot both own a new folder. The second is what can be added
 * inside the folder the first one made, and any number of those can be chosen
 * at once. The recommended stack leads the first list and says so.
 *
 * Nothing here moves the wizard on by itself any more. With more than one
 * answer available, leaving the step is the person's own decision.
 */
export function StackStep({ kind, tools, selected, extras, browsing, onChoose, onToggleExtra, onContinue, onBrowse }: {
  kind: ProjectKind | null; tools: Record<string, boolean>; selected: string | null; extras: string[]; browsing: boolean;
  onChoose: (templateId: string | null) => void; onToggleExtra: (templateId: string) => void;
  onContinue: () => void; onBrowse: (on: boolean) => void;
}) {
  const { colors } = useTheme();
  if (browsing) return <StackBrowser kind={kind} tools={tools} selected={selected} onChoose={onChoose} onBack={() => onBrowse(false)} />;
  const chosen = selected ?? null;
  // Every stack filed under the kind answers the question, including the ones
  // that happen to layer: plain HTML is a perfectly good website on its own.
  // The additions are a different question — what to put inside it — so they
  // are drawn from other kinds and never repeat what is offered above.
  const bases = kind ? templatesForKind(kind) : [];
  const additions = kind ? additionsFor(kind, chosen) : [];
  return <>
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Group inset={16}>
        {bases.map((entry, index) => <StackRow key={entry.id} entry={entry} missing={missingTools(entry, tools)}
          recommended={index === 0} selected={chosen === entry.id} onPick={() => onChoose(entry.id)} />)}
        <Pressable accessibilityRole="button" accessibilityLabel="Other stacks" onPress={() => onBrowse(true)}
          style={({ pressed }) => [s.other, { backgroundColor: pressed ? colors.elevated : 'transparent' }]}>
          <View style={s.text}>
            <Text style={[s.otherTitle, { color: colors.accent }]}>Other…</Text>
            <Text style={[s.blurb, { color: colors.muted }]}>Search every stack Vibyra can start, whatever it is filed under</Text>
          </View>
          <Icon name="chevron-forward" size={15} color={colors.accent} />
        </Pressable>
      </Group>
      {additions.length > 0 && <>
        <Text accessibilityRole="header" style={[s.label, { color: colors.muted }]}>Add to it</Text>
        <Text style={[s.lead, { color: colors.muted }]}>
          A server or a model layer, inside the same project. Pick as many as you want.
        </Text>
        <Group inset={16}>
          {additions.map(entry => <StackRow key={entry.id} entry={entry} missing={missingTools(entry, tools)}
            addable selected={extras.includes(entry.id)} onPick={() => onToggleExtra(entry.id)} />)}
        </Group>
      </>}
    </ScrollView>
    <WizardFooter primary={{ title: 'Continue', onPress: onContinue, disabled: !chosen }}
      quiet={[{ title: 'Skip — just make a folder', onPress: () => onChoose(null) }]} />
  </>;
}
const s = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 },
  other: { minHeight: 62, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  otherTitle: { fontSize: 15.5, fontWeight: '600', letterSpacing: -0.2 },
  blurb: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2, marginTop: 26, marginLeft: 2 },
  lead: { fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 10, marginLeft: 2 },
});
