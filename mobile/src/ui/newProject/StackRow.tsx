import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import type { ProjectTemplate } from '../../scaffold/types';
import { Icon } from '../primitives';
import { StackMark } from './StackMark';

/**
 * One stack, led by its own mark. Shared by the kind's own list and the
 * whole-catalog browser so the two cannot drift into looking like different
 * things. A missing
 * toolchain is named, not merely greyed: "Needs flutter" is the whole reason
 * the row cannot be tapped.
 */
export function StackRow({ entry, missing, kindLabel, recommended, selected, onPick }: {
  entry: ProjectTemplate;
  /** Required tools the computer has said are not on its PATH. */
  missing: string[];
  /** The kind this stack is filed under, shown only while browsing them all. */
  kindLabel?: string;
  /** The safe default for this kind. It was always the first row; now it says so. */
  recommended?: boolean;
  selected: boolean;
  onPick: () => void;
}) {
  const { colors } = useTheme();
  const blocked = missing.length > 0;
  return <Pressable accessibilityRole="button" accessibilityLabel={entry.name} accessibilityHint={entry.blurb}
    accessibilityState={{ disabled: blocked, selected }} aria-disabled={blocked} disabled={blocked} onPress={onPick}
    style={({ pressed }) => [s.row, { backgroundColor: selected ? colors.accentSoft : pressed ? colors.elevated : 'transparent',
      opacity: blocked ? 0.6 : 1 }]}>
    <StackMark templateId={entry.id} kind={entry.kinds[0]!} />
    <View style={s.text}>
      <View style={s.nameRow}>
        <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{entry.name}</Text>
        {recommended && <View style={[s.kind, { backgroundColor: colors.accentSoft }]}>
          <Text style={[s.kindText, { color: colors.accent }]}>Recommended</Text></View>}
        {kindLabel && <View style={[s.kind, { backgroundColor: colors.elevated }]}>
          <Text style={[s.kindText, { color: colors.muted }]}>{kindLabel}</Text></View>}
      </View>
      <Text numberOfLines={2} style={[s.blurb, { color: colors.muted }]}>{entry.blurb}</Text>
    </View>
    {blocked
      ? <View style={[s.need, { borderColor: colors.warning }]}>
        <Text numberOfLines={1} style={[s.needText, { color: colors.warning }]}>{`Needs ${missing.join(' and ')}`}</Text></View>
      : <Icon name="chevron-forward" size={15} color={selected ? colors.accent : colors.muted} />}
  </Pressable>;
}
const s = StyleSheet.create({
  row: { minHeight: 66, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 13 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15.5, fontWeight: '600', letterSpacing: -0.2, flexShrink: 1 },
  kind: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  kindText: { fontSize: 11, fontWeight: '600' },
  blurb: { fontSize: 13, lineHeight: 18 },
  need: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, maxWidth: 130 },
  needText: { fontSize: 11.5, fontWeight: '700' },
});
