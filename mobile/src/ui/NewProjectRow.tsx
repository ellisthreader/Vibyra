import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './primitives';

/**
 * The first row of the Projects card: the same shape as a folder row, with a
 * plus where the folder tile would be, so starting a project sits in the list
 * of projects rather than in a button floating over it. It opens the New
 * project sheet.
 *
 * A computer that cannot build one keeps the row and gives the reason on its
 * own line instead of disappearing. The row used to be drawn only where it
 * worked, which left a paired Desktop with no trace of the feature at all.
 */
export function NewProjectRow({ host, reason, onPress }: { host: string; reason?: string; onPress: () => void }) {
  const { colors } = useTheme();
  const blocked = Boolean(reason);
  return <Pressable accessibilityRole="button" accessibilityLabel="New project"
    accessibilityHint={reason ?? 'Starts a project on your computer'}
    accessibilityState={{ disabled: blocked }} aria-disabled={blocked} disabled={blocked}
    onPress={onPress} style={({ pressed }) => [s.row, { opacity: blocked ? 0.55 : pressed ? 0.55 : 1 }]}>
    <View style={[s.tile, { backgroundColor: colors.accentSoft }]}><Icon name="add" size={24} color={colors.accent} /></View>
    <View style={s.text}>
      <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>New project</Text>
      <Text numberOfLines={2} style={[s.detail, { color: colors.muted }]}>{reason ?? `Start something new on ${host}`}</Text>
    </View>
    {blocked ? null : <Icon name="chevron-forward" size={16} color={colors.muted} />}
  </Pressable>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 13, minHeight: 72 },
  tile: { width: 46, height: 46, borderRadius: 46 / 3, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  detail: { fontSize: 13, lineHeight: 18 },
});
