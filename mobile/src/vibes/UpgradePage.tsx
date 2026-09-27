import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from '../ui/primitives';
import { PlanTabs } from './PlanTabs';
import { WalletLinks, WalletPage } from './WalletChrome';
import { benefitsFor, planNames } from './plans';
import { styles as s } from './UpgradePageStyles';
import type { WalletPurchase } from './useWalletPurchase';
import type { VibesWallet } from './types';

const detailOrder = ['rate', 'projects', 'rollover'];

/** One centered offer: choose a size, see its allowance, then decide. */
export function UpgradePage({
  buy,
  wallet,
  onBack,
  onClose,
  onPreview,
}: {
  buy: WalletPurchase;
  wallet: VibesWallet | null;
  onBack(): void;
  onClose(): void;
  onPreview?(): void;
}) {
  const { colors } = useTheme();
  const offer = buy.plan;
  const name = offer ? planNames[offer.plan ?? ''] ?? offer.plan ?? '' : '';
  const details = wallet && offer
    ? benefitsFor(offer, wallet)
        .filter((item) => detailOrder.includes(item.id))
        .sort((a, b) => detailOrder.indexOf(a.id) - detailOrder.indexOf(b.id))
    : [];

  return (
    <WalletPage centred showWash={false} onBack={onBack} onClose={onClose}>
      {offer && (
        <View testID="upgrade-card" style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Get Vibyra Pro</Text>
          <Text style={[s.lead, { color: colors.muted }]}>More Vibes for everything you build.</Text>

          {buy.sizes.length > 1 ? (
            <PlanTabs sizes={buy.sizes} selected={offer.plan ?? null} disabled={buy.busy} onSelect={buy.choose} />
          ) : (
            <Text style={[s.singleSize, { color: colors.muted }]}>{name}</Text>
          )}

          <View style={s.allowance}>
            <Text testID="plan-allowance" style={[s.amount, { color: colors.text }]}>
              {offer.credits.toLocaleString()}
            </Text>
            <Text style={[s.unit, { color: colors.muted }]}>Vibes every month</Text>
          </View>

          {details.length > 0 && (
            <View testID="upgrade-details" style={[s.details, { borderTopColor: colors.border }]}>
              {details.map((item) => (
                <Text key={item.id} style={[s.detail, { color: colors.muted }]}>{item.label}</Text>
              ))}
            </View>
          )}

          {buy.notice && !buy.notice.ok && (
            <Text accessibilityRole="alert" style={[s.notice, { color: colors.error }]}>{buy.notice.text}</Text>
          )}
          {buy.bridge && !buy.price && buy.notice?.ok === false && (
            <View style={s.action}>
              <Button title="Retry Apple prices" onPress={buy.reloadPrices} disabled={buy.busy} secondary />
            </View>
          )}
          {buy.price && (
            <View style={s.action}>
              <Button
                title={`Get ${name} · ${buy.price} a month`}
                busy={buy.busy}
                disabled={!buy.canBuy}
                onPress={() => buy.buy(offer.id)}
              />
            </View>
          )}
          {!buy.bridge && (
            <Text style={[s.terms, { color: colors.muted }]}>Available in the installed iPhone app.</Text>
          )}
          {buy.bridge && buy.price && (
            <Text style={[s.terms, { color: colors.muted }]}>
              Billed through your Apple Account. Renews monthly until cancelled.
            </Text>
          )}
        </View>
      )}
      {offer && <WalletLinks onRestore={buy.restore} disabled={!buy.bridge || buy.busy} />}
      {__DEV__ && onPreview && offer && (
        <Pressable accessibilityRole="button" onPress={onPreview} disabled={buy.busy} style={s.previewAction}>
          <Text style={[s.preview, { color: colors.muted }]}>Test Pro upgrade</Text>
        </Pressable>
      )}
    </WalletPage>
  );
}
