import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { TokenMark } from './TokenMark';
import { useVibes } from './VibesProvider';

/**
 * How many Vibes you have, at the foot of the rail: the coin and the number, and
 * nothing else. It replaced the "Vibyra tokens" row, a whole tab for one figure.
 *
 * Nothing is drawn behind them. It was a capsule, the twin of the account button,
 * until that was asked to go for something simpler: the coin already is a shape, so
 * a second one around it only framed a frame. The coin is the unit, the way a
 * currency sign is, so the word "Vibes" is left to the accessibility label.
 * Tapping it opens Vibyra tokens in Settings; the tap area keeps a button's height.
 *
 * No wallet, nothing at all. A balance that has not loaded is not zero, and a
 * dash on its own reads as something broken.
 */
export function DrawerBalance({
  onPress,
  style,
}: {
  onPress(): void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { wallet } = useVibes();
  if (!wallet) return null;
  const count = wallet.available.toLocaleString();
  return (
    <Pressable
      accessibilityRole="button"
      testID="drawer-balance"
      accessibilityLabel={`${count} ${wallet.available === 1 ? 'Vibe' : 'Vibes'}`}
      accessibilityHint="Opens Vibyra tokens"
      onPress={onPress}
      style={({ pressed }) => [s.balance, style, { opacity: pressed ? 0.55 : 1 }]}
    >
      <TokenMark size={32} />
      <Text numberOfLines={1} style={[s.count, { color: colors.text }]}>
        {count}
      </Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  balance: {
    minHeight: 46,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  count: { fontSize: 20, fontWeight: '600', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
});
