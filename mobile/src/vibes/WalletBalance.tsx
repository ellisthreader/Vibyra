import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { TokenMark } from './TokenMark';
import type { VibesWallet } from './types';

/**
 * What the page is for: the Vibes you have. One figure, its unit, and — only when
 * there is one — the single fact that explains why the figure is short.
 *
 * It has been cut back twice, and the second cut is the one to respect. The figure
 * used to be followed by a plan pill, a renewal date, a trial-chats count and a
 * held note, latterly tidied into a labelled row list. Tidy did not fix it: four
 * facts under one number is four things to read before learning anything, and the
 * page was reported as confusing for a natural user with "too much information
 * going on". The plan and the trial count were dropped outright — the plan is named
 * on the rail row and sold on the upgrade page, and a trial-chat tally is an
 * accounting detail nobody arrived to read. The renewal went with them, because the
 * limits below now answer "when can I use more" for every span that matters.
 *
 * What survives is `held`, and only while it is non-zero. It is the one line that
 * stops the figure quietly disagreeing with the balance in the rail, so it earns
 * its place by preventing a question rather than by answering one. It is named
 * after its reason: "Held" alone invites "held by whom?".
 *
 * Nothing here is tinted and nothing is boxed. Graphite and Cobalt asks for fewer
 * boxes and stronger hierarchy, and the block below draws the only rule the page
 * needs. Nothing may become an `A · B · C` meta string; that was rejected here once
 * already.
 *
 * `shown` is the figure to draw, counted for us by the owner of the Vibes area.
 * It cannot be counted here: a purchase made on the upgrade page mounts this
 * component for the first time only once the balance has already changed, so a
 * counter started here would open at the new total and animate nothing.
 */
export function WalletBalance({ wallet, shown }: { wallet: VibesWallet | null; shown: number }) {
  const { colors } = useTheme();
  // Nothing is said about a wallet that has not arrived: the page already carries
  // one hint about that, and two of them read as two separate problems.
  const held = wallet && wallet.held > 0 ? wallet.held : 0;
  return <View>
    {/* The mark sits *beside* the figure, on its line, rather than stacked above
        it. Above, it was a third thing to look at before reaching the number; on
        the line it reads as the number's unit — the way a currency symbol does —
        and the block collapses from three rows to two. It is deliberately smaller
        than the figure: identity, not illustration. */}
    <View style={s.head}>
      <TokenMark size={34} />
      {/* Labelled from the wallet, not from the counter, so assistive technology is
          told the balance rather than whichever frame it is passing through. */}
      <Text testID="balance" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit
        accessibilityLabel={wallet ? `${wallet.available.toLocaleString()} Vibes available` : 'Balance loading'}
        style={[s.figure, { color: colors.text }]}>{wallet ? shown.toLocaleString() : '—'}</Text>
    </View>
    <Text style={[s.unit, { color: colors.muted }]}>Vibes available</Text>
    {held > 0 && <Text style={[s.held, { color: colors.muted }]}>
      {held.toLocaleString()} held while replies finish</Text>}
  </View>;
}
const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // `flexShrink` so `adjustsFontSizeToFit` still has room to work on a long figure
  // now that the mark is taking part of the line.
  figure: { flexShrink: 1, fontSize: 44, lineHeight: 50, fontWeight: '700', letterSpacing: -1.8, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 14, lineHeight: 21, letterSpacing: -0.2 },
  held: { fontSize: 13, lineHeight: 19, marginTop: 6 },
});
