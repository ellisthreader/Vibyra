import { WalletActivity } from './WalletActivity';
import { Text, View } from 'react-native';
import { useTheme } from '../theme';
import { formatTokens } from './tokenUnits';
import type { VibesWallet } from './types';

export function WalletDetails({ wallet }: { wallet: VibesWallet }) {
  const { colors } = useTheme();
  if (wallet.version !== 2) return null;
  const free = wallet.freeAllowance;
  const line = { color: colors.muted, fontSize: 13, lineHeight: 20 };
  return <View style={{ gap: 6 }}>
    <Text style={line}>{formatTokens(wallet.paidAvailable)} paid tokens · never expire</Text>
    {free?.expiresAt && <Text style={line}>Free tokens expire {new Date(free.expiresAt).toLocaleDateString()}.</Text>}
    {wallet.plan === 'free' && <Text style={line}>{free?.eligible
      ? `${free.tokens} free tokens each month. Next allowance ${free.nextAt ? new Date(free.nextAt).toLocaleDateString() : 'pending'}.`
      : 'Monthly free tokens are a limited pilot. This account is not enrolled yet.'}</Text>}
    <Text style={line}>Your own Codex and Claude accounts do not spend Vibyra tokens.</Text>
    {wallet.membership?.conflict && <Text accessibilityRole="alert" style={line}>More than one subscription is active. Contact support to resolve billing.</Text>}
    {!wallet.guest && <WalletActivity scope={wallet.accountToken} />}
  </View>;
}
