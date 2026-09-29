import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './primitives';

/** Settings owns connection, support and account actions. */
export function DrawerFooterActions({ onSettings }: {
  onSettings(): void;
  onReport?: () => void;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings}
    style={({ pressed }) => [s.button, { backgroundColor: pressed ? colors.accentSoft : colors.elevated }]}>
    <Icon name="settings-outline" size={22} color={colors.text} />
  </Pressable>;
}
const s = StyleSheet.create({
  button: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
