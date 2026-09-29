import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { PROJECT_KINDS } from '../../scaffold/kinds';
import type { ProjectKind } from '../../scaffold/types';
import { Icon } from '../primitives';
import { KIND_COLORS } from './kindPalette';
import { ProjectKindIcon } from './ProjectKindIcon';
import { WizardFooter } from './WizardFooter';

/**
 * Question one, whole on the screen: eight kinds as a two-by-four grid of
 * cards, each with its mark, its name and one line on what it covers. A bare
 * mark and a word floated in the middle of a tall sheet read as unfinished;
 * the card gives each answer an edge and the blurb makes it an answer rather
 * than a guess at what "Web app" means. A single grouped list was tried and
 * rejected: the person wants buttons to press, not rows to read.
 *
 * `empty` is not a card. It is the way out of the question, not one of the
 * answers, so it is the footer's quiet action and takes the same path.
 */
const KINDS = PROJECT_KINDS.filter((kind) => kind.id !== 'empty');

export function KindStep({
  current,
  onChoose,
}: {
  current: ProjectKind | null;
  onChoose: (kind: ProjectKind | null) => void;
}) {
  const { colors } = useTheme();
  return (
    <>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        <View style={s.grid}>
          {KINDS.map((kind) => {
            const on = current === kind.id;
            const tint = KIND_COLORS[kind.id];
            return (
              <Pressable
                key={kind.id}
                accessibilityRole="button"
                accessibilityLabel={kind.name}
                accessibilityHint={kind.blurb}
                accessibilityState={{ selected: on }}
                onPress={() => onChoose(kind.id)}
                style={({ pressed }) => [
                  s.card,
                  {
                    backgroundColor: on ? `${tint}14` : colors.elevated,
                    borderColor: on ? tint : colors.border,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                <View style={s.top}>
                  <View style={[s.mark, { backgroundColor: `${tint}24` }]}>
                    <ProjectKindIcon kind={kind.id} size={20} color={tint} />
                  </View>
                  {on && (
                    <View style={[s.check, { backgroundColor: tint }]}>
                      <Icon name="checkmark" size={12} color="#FFFFFF" />
                    </View>
                  )}
                </View>
                <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>
                  {kind.name}
                </Text>
                <Text numberOfLines={2} style={[s.blurb, { color: colors.muted }]}>
                  {kind.blurb}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <WizardFooter
        quiet={[
          {
            title: 'Skip — start with an empty folder',
            label: 'Empty project',
            onPress: () => onChoose('empty'),
          },
        ]}
      />
    </>
  );
}
const s = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  card: {
    width: '48.4%',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.25 },
  blurb: { fontSize: 12.5, lineHeight: 17 },
});
