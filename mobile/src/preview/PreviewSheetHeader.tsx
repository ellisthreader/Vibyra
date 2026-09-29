import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';

/** The bar every sheet in the app wears: the name over the middle, a round close at the
 *  right. Preview is a full-screen modal (its transport view must stay mounted), so it
 *  draws the same bar itself instead of borrowing `Sheet`'s page sheet. */
export function PreviewSheetHeader({ onClose }: { onClose(): void }) {
  const { colors } = useTheme();
  return <View style={s.bar}>
    <Text accessibilityRole="header" pointerEvents="none" numberOfLines={1} style={[s.title, { color: colors.text }]}>Live preview</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Close Live Preview" onPress={onClose} hitSlop={7}
      style={({ pressed }) => [s.close, { backgroundColor: colors.elevated, opacity: pressed ? 0.55 : 1 }]}>
      <Icon name="close" size={18} color={colors.muted} />
    </Pressable>
  </View>;
}

const s = StyleSheet.create({
  bar: { minHeight: 56, paddingLeft: 12, paddingRight: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  // Laid over the bar, so the name sits on the sheet's middle, not on what the close leaves.
  title: { position: 'absolute', left: 56, right: 56, top: 0, bottom: 0, lineHeight: 56, textAlign: 'center',
    fontSize: 17, fontWeight: '600', letterSpacing: -0.35 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
