import type { ReactNode } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { links } from '../settings/links';
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
 *
 * `title` is optional because a page whose own headline names it — the upgrade's
 * "Get Vibyra Pro" — would only say it twice. `footer` sits under the scroll rather
 * than in it, so a purchase stays at the bottom of the screen however long the page
 * above it runs; the destination's safe area already pads the home indicator.
 *
 * `centred` is for a page composed as one screen, like the paywall: what is above
 * the footer sits in the room left rather than a tall phone's spare height becoming
 * one gap over the button. It sits a third of the way down that room, not halfway:
 * the true middle read as low, and a third is the optical centre. The two spacers
 * sit outside the padded, gapped column, so a small phone with no room to spare
 * loses nothing to them, and it still scrolls when it has less than it needs.
 */
export function WalletPage({
  title,
  onBack,
  onClose,
  refreshing = false,
  onRefresh,
  footer,
  centred,
  children,
}: {
  title?: string;
  onBack?: () => void;
  onClose(): void;
  centred?: boolean;
  // Optional together: a page with no account behind it has nothing to pull for,
  // and a refresh control that reloads nothing is a promise the page cannot keep.
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={s.page}>
      <Wash id="vibes" height={330 + insets.top} />
      {/* Laid out like the app's own bar: the name centred over the page, a way back on
        the left when there is one, and the close on the right. */}
      <View style={[s.bar, { paddingTop: insets.top + 6 }]}>
        {title ? (
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            pointerEvents="none"
            style={[s.crumb, { top: insets.top + 6, color: colors.text }]}
          >
            {title}
          </Text>
        ) : null}
        {onBack ? (
          <IconButton icon="chevron-back" label="Back to your Vibes" onPress={onBack} />
        ) : (
          <View style={s.slot} />
        )}
        <View style={s.spacer} />
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>
      <ScrollView
        contentContainerStyle={centred ? s.fill : s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.accent}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
      >
        {centred ? (
          <>
            <View style={s.above} />
            <View style={[s.content, s.snug]}>{children}</View>
            <View style={s.below} />
          </>
        ) : (
          children
        )}
      </ScrollView>
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </View>
  );
}

/**
 * The paywall's small print: the three links Apple asks for beside a subscription's
 * price. They are the upgrade page's alone — a paywall has to offer them beside the
 * purchase rather than one page away — and they take the muted colour of the
 * renewal line above them, so the button stays the only cobalt thing near the bottom.
 */
export function WalletLinks({ onRestore, disabled }: { onRestore(): void; disabled?: boolean }) {
  return (
    <View style={s.links}>
      <Link label="Restore Purchases" disabled={disabled} onPress={onRestore} />
      <Link
        label="Terms"
        onPress={() =>
          void Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')
        }
      />
      <Link label="Privacy" onPress={() => void Linking.openURL(links.privacy)} />
    </View>
  );
}
function Link({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress(): void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={s.link}>
      <Text style={[s.linkText, { color: colors.muted }]}>{label}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  page: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: 8 },
  crumb: {
    position: 'absolute',
    left: 60,
    right: 60,
    height: 44,
    lineHeight: 44,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.35,
  },
  slot: { width: 44 },
  spacer: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 24 },
  fill: { flexGrow: 1 },
  above: { flexGrow: 1 },
  below: { flexGrow: 2 },
  // The footer's own top padding spaces a centred page from its button, so the
  // column keeps none of the 32pt a page that scrolls to its end needs.
  snug: { paddingBottom: 8, gap: 20 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, gap: 10 },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 20,
    marginTop: -10,
  },
  link: { minHeight: 40, justifyContent: 'center' },
  linkText: { fontSize: 12, fontWeight: '500', textDecorationLine: 'underline' },
});
