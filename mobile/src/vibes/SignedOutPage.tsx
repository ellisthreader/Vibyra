import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from '../ui/primitives';
import { TokenMark } from './TokenMark';
import { WalletPage } from './WalletChrome';

/**
 * Vibyra tokens, before there is an account to hold any.
 *
 * Everything this page used to carry was a figure it could not know. Signed out
 * there is no wallet, so the balance drew "—", the plan chip vanished, the "how
 * Vibes work" rules described an economy nobody was in yet, the store links
 * offered a restore with nothing to restore to, and over all of it sat the
 * failure of the wallet call itself: "Sign in to use your Vibes", rendered as a
 * red error, as though the person had done something wrong by arriving.
 *
 * They had not. Being signed out is a state, not a fault, and it has exactly one
 * thing to say and one thing to do. Nothing is invented to fill the rest of the
 * page: no plan prices, no free-Vibe figure. Those are the backend's numbers and
 * the backend has not been asked yet.
 */
export function SignedOutPage({ onSignIn, onClose }: { onSignIn(): void; onClose(): void }) {
  const { colors } = useTheme();
  return <WalletPage title="Vibyra tokens" onClose={onClose}>
    <View style={s.body}>
      <TokenMark size={76} />
      <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Vibes are what{'\n'}a reply costs.</Text>
      <Text style={[s.line, { color: colors.muted }]}>Sign in to see your balance and your plan.</Text>
      <View style={s.action}><Button title="Sign in" onPress={onSignIn} /></View>
    </View>
  </WalletPage>;
}
const s = StyleSheet.create({
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingTop: 40, paddingBottom: 24 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: '500', letterSpacing: -1, textAlign: 'center' },
  line: { fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: -6 },
  action: { alignSelf: 'stretch', marginTop: 6 },
});
