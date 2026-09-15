import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import type { ProjectTemplate } from '../../scaffold/types';
import { Icon } from '../primitives';
import { StackMark } from './StackMark';

/**
 * One stack, led by its own mark. Shared by the kind's own list and the
 * whole-catalog browser so the two cannot drift into looking like different
 * things. A missing toolchain is named, not merely greyed: "Needs flutter" is
 * the whole reason the row cannot be tapped.
 *
 * The control on the right says what kind of answer this is. A circle means one
 * of these — the stack that makes the project, and picking another swaps it. A
 * square means any of these — something added inside the folder the first one
 * made. That difference is the rule about what can be combined, drawn rather
 * than explained.
 */
export function StackRow({ entry, missing, kindLabel, selected, addable, recommended, onPick }: {
  entry: ProjectTemplate;
  /** Required tools the computer has said are not on its PATH. */
  missing: string[];
  /** The kind this stack is filed under, shown only while browsing them all. */
  kindLabel?: string;
  selected: boolean;
  /** This stack layers on top of the base rather than replacing it. */
  addable?: boolean;
  /** The safe default for this kind, which is the first row. */
  recommended?: boolean;
  onPick: () => void;
}) {
  const { colors } = useTheme();
  const blocked = missing.length > 0;
  return <Pressable accessibilityRole={addable ? 'checkbox' : 'radio'} accessibilityLabel={entry.name}
    accessibilityHint={entry.blurb} accessibilityState={{ disabled: blocked, checked: selected, selected }}
    aria-disabled={blocked} aria-checked={selected} disabled={blocked} onPress={onPick}
    style={({ pressed }) => [s.row, { backgroundColor: selected ? colors.accentSoft : pressed ? colors.elevated : 'transparent',
      opacity: blocked ? 0.6 : 1 }]}>
    <StackMark templateId={entry.id} kind={entry.kinds[0]!} />
    <View style={s.text}>
      <View style={s.nameRow}>
        <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{entry.name}</Text>
        {recommended && <View style={[s.tag, { backgroundColor: colors.accentSoft }]}>
          <Text style={[s.tagText, { color: colors.accent }]}>Recommended</Text></View>}
        {kindLabel && <View style={[s.tag, { backgroundColor: colors.elevated }]}>
          <Text style={[s.tagText, { color: colors.muted }]}>{kindLabel}</Text></View>}
      </View>
      <Text numberOfLines={2} style={[s.blurb, { color: colors.muted }]}>{entry.blurb}</Text>
    </View>
    {blocked
      ? <View style={[s.need, { borderColor: colors.warning }]}>
        <Text numberOfLines={1} style={[s.needText, { color: colors.warning }]}>{`Needs ${missing.join(' and ')}`}</Text></View>
      : <View style={[s.box, { borderRadius: addable ? 7 : 11,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accent : 'transparent' }]}>
        {selected && <Icon name="checkmark" size={14} color="#FFFFFF" />}
      </View>}
  </Pressable>;
}
const s = StyleSheet.create({
  row: { minHeight: 66, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 13 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { fontSize: 15.5, fontWeight: '600', letterSpacing: -0.2, flexShrink: 1 },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  tagText: { fontSize: 11, fontWeight: '600' },
  blurb: { fontSize: 13, lineHeight: 18 },
  need: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, maxWidth: 130 },
  needText: { fontSize: 11.5, fontWeight: '700' },
  box: { width: 22, height: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
