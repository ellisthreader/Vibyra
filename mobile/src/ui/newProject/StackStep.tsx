import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { additionsFor, canLayer, missingTools, templatesForKind } from '../../scaffold/templates';
import type { ProjectKind, ProjectTemplate } from '../../scaffold/types';
import { Group } from '../../settings/SettingsRows';
import { Icon } from '../primitives';
import { StackBrowser } from './StackBrowser';
import { StackRow } from './StackRow';
import { WizardFooter } from './WizardFooter';

/**
 * Question two. One list, rows not tiles: the blurb is what picks the stack,
 * and a missing toolchain has to be readable rather than merely greyed out.
 * The recommended stack leads it and says so.
 *
 * More than one can be chosen. The list runs the kind's own stacks first, then
 * the things worth putting inside whichever of them is picked — a server, a
 * model layer — because a project is often two of these and picking the second
 * one should not mean starting again.
 *
 * Only one stack can make the folder, though: two scaffolders both expecting to
 * own an empty directory is the second one failing on the first one's files. So
 * choosing another of those quietly takes the place of the last, while the ones
 * that only add files inside simply accumulate. The ticks always show what is
 * actually going to be built.
 */
export function StackStep({
  kind,
  tools,
  selected,
  extras,
  browsing,
  onChoose,
  onToggleExtra,
  onContinue,
  onBrowse,
}: {
  kind: ProjectKind | null;
  tools: Record<string, boolean>;
  selected: string | null;
  extras: string[];
  browsing: boolean;
  onChoose: (templateId: string | null) => void;
  onToggleExtra: (templateId: string) => void;
  onContinue: () => void;
  onBrowse: (on: boolean) => void;
}) {
  const { colors } = useTheme();
  const pick = (entry: ProjectTemplate) =>
    canLayer(entry) ? onToggleExtra(entry.id) : onChoose(entry.id);
  if (browsing)
    return (
      <StackBrowser
        kind={kind}
        tools={tools}
        selected={selected}
        extras={extras}
        onPick={pick}
        onChoose={onChoose}
        onBack={() => onBrowse(false)}
      />
    );
  const own = kind ? templatesForKind(kind) : [];
  const entries = kind ? [...own, ...additionsFor(kind, selected)] : [];
  const on = (entry: ProjectTemplate) => entry.id === selected || extras.includes(entry.id);
  return (
    <>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <Group inset={16}>
          {entries.map((entry, index) => (
            <StackRow
              key={entry.id}
              entry={entry}
              missing={missingTools(entry, tools)}
              recommended={index === 0}
              selected={on(entry)}
              onPick={() => pick(entry)}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Other stacks"
            onPress={() => onBrowse(true)}
            style={({ pressed }) => [
              s.other,
              { backgroundColor: pressed ? colors.elevated : 'transparent' },
            ]}
          >
            <View style={s.text}>
              <Text style={[s.otherTitle, { color: colors.accent }]}>Other…</Text>
              <Text style={[s.blurb, { color: colors.muted }]}>
                Search every stack Vibyra can start, whatever it is filed under
              </Text>
            </View>
            <Icon name="chevron-forward" size={15} color={colors.accent} />
          </Pressable>
        </Group>
      </ScrollView>
      <WizardFooter
        primary={{
          title: 'Continue',
          onPress: onContinue,
          disabled: !selected && extras.length === 0,
        }}
        quiet={[{ title: 'Skip — just make a folder', onPress: () => onChoose(null) }]}
      />
    </>
  );
}
const s = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 },
  other: {
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  text: { flex: 1, minWidth: 0, gap: 3 },
  otherTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.25 },
  blurb: { fontSize: 13, lineHeight: 18 },
});
