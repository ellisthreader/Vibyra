import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { PROJECT_KINDS } from '../../scaffold/kinds';
import type { ProjectKind } from '../../scaffold/types';
import { KIND_COLORS } from './kindPalette';
import { ProjectKindIcon } from './ProjectKindIcon';
import { WizardFooter } from './WizardFooter';

/**
 * Question one, whole on the screen. Nine kinds are exactly a square, so they
 * are drawn as one — three by three, nothing below the fold. The question is
 * answered in a glance and a tap, which is the only thing this step is for.
 *
 * There are no cards. Nine bordered tiles made this read as a table of options
 * to work through; a mark in the kind's own colour over the sheet's own ground
 * reads as a choice to point at. Selection fills the mark and rings it, so the
 * answer is legible without a checkmark or a second colour.
 */
export function KindStep({ current, onChoose }: { current: ProjectKind | null; onChoose: (kind: ProjectKind | null) => void }) {
  const { colors } = useTheme();
  return <>
    <View style={s.grid}>
      {PROJECT_KINDS.map(kind => {
        const on = current === kind.id;
        const tint = KIND_COLORS[kind.id];
        return <Pressable key={kind.id} accessibilityRole="button" accessibilityLabel={kind.name}
          accessibilityHint={kind.blurb} accessibilityState={{ selected: on }} onPress={() => onChoose(kind.id)}
          style={({ pressed }) => [s.cell, { opacity: pressed ? 0.6 : 1 }]}>
          <View style={[s.mark, { backgroundColor: on ? tint : `${tint}1F`,
            borderColor: on ? tint : 'transparent' }]}>
            <ProjectKindIcon kind={kind.id} size={30} color={on ? '#FFFFFF' : tint} />
          </View>
          <Text numberOfLines={2} style={[s.name, { color: on ? colors.text : colors.muted,
            fontWeight: on ? '700' : '600' }]}>{kind.name}</Text>
        </Pressable>;
      })}
    </View>
    <WizardFooter quiet={[{ title: 'Skip — just make a folder', onPress: () => onChoose(null) }]} />
  </>;
}
const s = StyleSheet.create({
  // Three to a row, centred in the height it is given. Three rows pinned to the
  // top of a tall sheet read as the start of a longer list, which is the one
  // thing this step is not: it is all of the answers, at once.
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center',
    paddingHorizontal: 14, paddingBottom: 28 },
  cell: { width: '33.333%', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4, gap: 11 },
  mark: { width: 62, height: 62, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5 },
  name: { fontSize: 13.5, letterSpacing: -0.1, textAlign: 'center', lineHeight: 17 },
});
