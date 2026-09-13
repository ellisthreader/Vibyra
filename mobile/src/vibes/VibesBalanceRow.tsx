import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { vibes } from './count';
import { useVibes } from './VibesProvider';
import { planNames } from './plans';

/**
 * The balance in the navigation rail, so it is one tap from every screen rather
 * than only from the AI home. It is deliberately not gated on the Vibes feature
 * flag: plans stay readable on every runtime, and the upgrade sheet already
 * explains when purchases need the installed iPhone app.
 *
 * `signedIn` decides the wording, never the wallet. A missing wallet also means
 * a balance that has not loaded yet, so reading it as "signed out" told signed-in
 * people to sign in and sent them to Settings.
 */
export function VibesBalanceRow({ signedIn, selected, onWallet, onSignIn }: {
  signedIn: boolean; selected?: boolean; onWallet(): void; onSignIn(): void;
}) {
  const { colors } = useTheme();
  const { wallet } = useVibes();
  const title = wallet ? vibes(wallet.available) : signedIn ? 'Vibes' : 'Free Vibes';
  const trailing = wallet ? planNames[wallet.plan] ?? wallet.plan : signedIn ? '—' : 'Sign in';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${signedIn ? `${trailing} plan` : 'sign in to start'}`}
    accessibilityState={{ selected }} onPress={() => (signedIn ? onWallet() : onSignIn())}
    style={({ pressed }) => [s.row, { backgroundColor: selected || pressed ? colors.elevated : 'transparent' }]}>
    <View style={s.icon}><Icon name="sparkles-outline" size={19} color={colors.accent} /></View>
    <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>{title}</Text>
    <Text numberOfLines={1} style={[s.trailing, { color: colors.muted }]}>{trailing}</Text>
    <Icon name="chevron-forward" size={14} color={colors.muted} />
  </Pressable>;
}
const s = StyleSheet.create({
  row: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 15, fontWeight: '500', letterSpacing: -0.2 },
  trailing: { fontSize: 12, flexShrink: 0 },
});
