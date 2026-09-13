import type { ReactNode } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { IconButton } from '../ui/primitives';
import { Wash } from './WalletArt';

/**
 * The frame both Vibes pages share: the corner light, a bar that names the page,
 * and a scroll that pulls to refresh. It lives here so the balance and the upgrade
 * can be two separate pages without either of them owning the other's chrome.
 *
 * The name sits in the bar quietly, so whatever the page is actually for — a
 * balance, a set of plans — is the only thing competing to be read first.
 *
 * The top inset is padded here rather than by the destination's `SafeAreaView`,
 * which is why that one drops its top edge. `Wash` is lit from a source above the
 * page, so it has to start at the physical top of the screen; boxed below the
 * status bar it came on at full strength along a line across the notch instead of
 * fading in from the edge. The bar takes the inset back so the title still clears
 * the status bar, and the wash grows by it so its reach below the bar is unchanged.
 */
export function WalletPage({ title, onBack, onClose, refreshing = false, onRefresh, children }: {
  title: string; onBack?: () => void; onClose(): void;
  // Optional together: a page with no account behind it has nothing to pull for,
  // and a refresh control that reloads nothing is a promise the page cannot keep.
  refreshing?: boolean; onRefresh?: () => void; children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return <View style={s.page}>
    <Wash id="vibes" height={330 + insets.top} />
    <View style={[s.bar, !onBack && s.barPlain, { paddingTop: insets.top + 4 }]}>
      {onBack ? <IconButton icon="chevron-back" label="Back to your Vibes" onPress={onBack} /> : null}
      <Text accessibilityRole="header" style={[s.crumb, { color: colors.text }]}>{title}</Text>
      <View style={s.spacer} />
      <IconButton icon="close" label="Close" onPress={onClose} />
    </View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh
        ? <RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={onRefresh} /> : undefined}>
      {children}
    </ScrollView>
  </View>;
}

/**
 * The store links. Both pages carry them: the balance page is the area's home, and
 * the upgrade page is the paywall, which has to offer Terms, Privacy and a restore
 * beside the purchase rather than one page away from it.
 */
export function WalletLinks({ onRestore, disabled }: { onRestore(): void; disabled?: boolean }) {
  return <View style={s.links}>
    <Link label="Restore Purchases" disabled={disabled} onPress={onRestore} />
    <Link label="Manage" onPress={() => void Linking.openURL('https://apps.apple.com/account/subscriptions')} />
    <Link label="Terms" onPress={() => void Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')} />
    <Link label="Privacy" onPress={() => void Linking.openURL('https://vibyra.app/privacy')} />
  </View>;
}
function Link({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={s.link}>
    <Text style={[s.linkText, { color: colors.accent }]}>{label}</Text></Pressable>;
}
const s = StyleSheet.create({
  page: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: 10 },
  barPlain: { paddingLeft: 24 },
  crumb: { fontSize: 16, fontWeight: '600', letterSpacing: -0.3 },
  spacer: { flex: 1 },
  content: { paddingHorizontal: 24, paddingBottom: 32, gap: 24 },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 18, marginTop: -8 },
  link: { minHeight: 40, justifyContent: 'center' }, linkText: { fontSize: 13, fontWeight: '500' },
});
