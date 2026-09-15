import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { PROJECT_KINDS } from '../../scaffold/kinds';
import type { ProjectKind } from '../../scaffold/types';
import { ProjectKindIcon } from './ProjectKindIcon';
import { WizardFooter } from './WizardFooter';

/**
 * Question one. Nine tiles, two to a row, each a small drawing and two lines.
 * Every tile is optional: the footer skips the lot and makes a plain folder.
 */
export function KindStep({ current, onChoose }: { current: ProjectKind | null; onChoose: (kind: ProjectKind | null) => void }) {
  const { colors } = useTheme();
  return <>
    <ScrollView style={s.scroll} contentContainerStyle={s.grid} keyboardShouldPersistTaps="handled">
      {PROJECT_KINDS.map(kind => {
        const on = current === kind.id;
        return <Pressable key={kind.id} accessibilityRole="button" accessibilityLabel={kind.name}
          accessibilityHint={kind.blurb} accessibilityState={{ selected: on }} onPress={() => onChoose(kind.id)}
          style={({ pressed }) => [s.tile, { backgroundColor: on ? colors.accentSoft : pressed ? colors.elevated : colors.surface,
            borderColor: on ? colors.accent : colors.border }]}>
          <View style={[s.mark, { backgroundColor: on ? colors.accentSoft : colors.elevated }]}>
            <ProjectKindIcon kind={kind.id} size={18} color={on ? colors.accent : colors.muted} />
          </View>
          <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{kind.name}</Text>
          <Text numberOfLines={2} style={[s.blurb, { color: colors.muted }]}>{kind.blurb}</Text>
        </Pressable>;
      })}
    </ScrollView>
    <WizardFooter quiet={[{ title: 'Skip — just make a folder', onPress: () => onChoose(null) }]} />
  </>;
}
const s = StyleSheet.create({
  scroll: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 },
  // Two to a row at phone width; the gap is taken off each tile's half.
  tile: { flexBasis: '47%', flexGrow: 1, minHeight: 118, padding: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  mark: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  name: { fontSize: 15.5, fontWeight: '600', letterSpacing: -0.2 },
  blurb: { fontSize: 12.5, lineHeight: 17 },
});
