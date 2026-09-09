import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { planNames } from './plans';
import type { VibesWallet } from './types';

const renewal = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export function WalletBalance({ wallet }: { wallet: VibesWallet | null }) {
  const { colors } = useTheme();
  const renews = wallet ? renewal(wallet.paidUntil) : null;
  const plan = wallet ? planNames[wallet.plan] ?? wallet.plan : null;
  return <View style={s.balance}>
    <View style={[s.symbol, { backgroundColor: colors.accentSoft }]}><Icon name="sparkles-outline" size={22} color={colors.accent} /></View>
    <Text style={[s.number, { color: colors.text }]}>{wallet ? wallet.available.toLocaleString() : '—'}<Text style={s.unit}>{' '}Vibes</Text></Text>
    <Text style={[s.detail, { color: colors.muted }]}>{wallet?.held ? `${wallet.held} reserved for work in progress` : 'A little energy for your next big idea.'}</Text>
    {plan && <Text style={[s.plan, { color: colors.muted, borderColor: colors.border }]}>
      {wallet?.plan === 'free' ? 'Free plan' : renews ? `${plan} plan · renews ${renews}` : `${plan} plan`}</Text>}
    {wallet?.plan === 'free' && <Text style={[s.trial, { color: colors.muted }]}>
      {wallet.trialChatsRemaining} of 2 trial chats available · up to 50 Vibes each</Text>}
  </View>;
}
const s = StyleSheet.create({
  balance: { alignItems: 'center', gap: 8, paddingTop: 8, paddingBottom: 6 },
  symbol: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 44, fontWeight: '500', letterSpacing: -1.8, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 20, letterSpacing: -0.5 },
  detail: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  plan: { fontSize: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  trial: { fontSize: 12, lineHeight: 19, textAlign: 'center' },
});
