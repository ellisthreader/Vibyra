import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppContext } from "../../../../context/AppContext";
import { usePreferences } from "../../../../context/PreferencesContext";
import { openBillingPortal, startStripeCheckout } from "../../../../utils/billingApi";
import { styles } from "../../styles";
import { BillingCycleToggle } from "./BillingCycleToggle";
import { BillingPlanHero } from "./BillingPlanHero";
import { BillingPlanOption } from "./BillingPlanOption";
import { getPlanTier, normalizePlanKey } from "./billingUtils";
import { BillingCycle, PLAN_TIERS, PlanKey, nextRecommendedTier } from "./types";
import { useProfileBillingPurchase } from "./useProfileBillingPurchase";

const MANAGE_SUBSCRIPTION_URL = Platform.select({
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
  default: "https://apps.apple.com/account/subscriptions"
}) as string;

export function BillingSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const app = useAppContext();
  const prefs = usePreferences();
  const insets = useSafeAreaInsets();
  const currentKey = normalizePlanKey(app.accountPlan);
  const recommendedKey = currentKey === "pro" ? "pro" : nextRecommendedTier(currentKey);
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const [selectedKey, setSelectedKey] = useState<PlanKey>(recommendedKey);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const selectedTier = getPlanTier(selectedKey);
  const light = prefs.effectiveScheme === "light";
  const purchase = useProfileBillingPurchase(selectedKey, cycle);
  const busy = checkoutBusy || purchase.isPurchasing;

  useEffect(() => {
    if (!visible) return;
    setSelectedKey(recommendedKey);
    setBillingError("");
  }, [recommendedKey, visible]);

  async function openSubscriptionManagement() {
    try {
      if (app.authToken) {
        const result = await openBillingPortal(app.authToken);
        await Linking.openURL(result.url);
        return;
      }
      await Linking.openURL(MANAGE_SUBSCRIPTION_URL);
    } catch {
      await Linking.openURL(MANAGE_SUBSCRIPTION_URL).catch(() => {
        setBillingError("Could not open subscription management. Try again in a moment.");
      });
    }
  }

  async function handlePrimaryAction() {
    if (busy) return;
    setBillingError("");

    if (selectedKey === currentKey || selectedKey === "free") {
      await openSubscriptionManagement();
      return;
    }

    if (Platform.OS !== "web") {
      await purchase.buyMembership();
      return;
    }

    if (!app.authToken) {
      setBillingError("Log in again to upgrade your plan.");
      return;
    }

    try {
      setCheckoutBusy(true);
      const result = await startStripeCheckout(app.authToken, {
        kind: "subscription",
        plan: selectedKey as Exclude<PlanKey, "free">,
        cycle
      });
      await Linking.openURL(result.url);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Could not start checkout. Try again in a moment.");
    } finally {
      setCheckoutBusy(false);
    }
  }

  function primaryLabel() {
    if (busy) return "Opening secure checkout...";
    if (selectedKey === currentKey) return "Manage current plan";
    if (selectedKey === "free") return "Manage subscription";
    return `Upgrade to ${selectedTier.name} ${cycle === "annual" ? "Annual" : "Monthly"}`;
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <View style={[styles.billingScreen, { backgroundColor: prefs.colors.background }]}>
        <View style={[styles.billingHeader, { paddingTop: Math.max(insets.top + 10, 24) }]}>
          <Pressable accessibilityLabel="Back" onPress={onClose} style={styles.billingHeaderBack}>
            <Ionicons name="arrow-back" color={prefs.effectiveScheme === "light" ? "#0A0814" : "#FFFFFF"} size={24} />
          </Pressable>
          <Text style={[styles.billingHeaderTitle, { color: prefs.colors.text }]}>{prefs.t("billing.title")}</Text>
          <View style={[styles.billingHeaderTokens, { backgroundColor: light ? prefs.colors.surface : "rgba(15, 15, 24, 0.92)" }]}>
            <Ionicons name="flash" color="#FFD166" size={13} />
            <Text style={styles.billingHeaderTokensText}>{prefs.formatNumber(app.creditsBalance)} {prefs.t("billing.tokens")}</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.billingScrollContent,
            { paddingBottom: 18, paddingTop: 8 }
          ]}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          <BillingPlanHero
            cycle={cycle}
            tier={selectedTier}
          />

          <BillingCycleToggle cycle={cycle} onChange={setCycle} />

          <View style={styles.billingPlanOptions}>
            {PLAN_TIERS.map((tier) => (
              <BillingPlanOption
                key={tier.key}
                cycle={cycle}
                tier={tier}
                isCurrent={tier.key === currentKey}
                isRecommended={tier.key === recommendedKey && tier.key !== currentKey}
                isSelected={tier.key === selectedKey}
                onPress={() => setSelectedKey(tier.key)}
              />
            ))}
          </View>

        </ScrollView>

        <View
          style={{
            backgroundColor: light ? prefs.colors.surface : "rgba(8, 8, 14, 0.96)",
            borderColor: light ? prefs.colors.border : "rgba(255, 255, 255, 0.08)",
            borderTopWidth: 1,
            gap: 9,
            paddingBottom: Math.max(insets.bottom + 10, 18),
            paddingHorizontal: 18,
            paddingTop: 12
          }}
        >
          {billingError || purchase.purchaseError ? <Text style={styles.billingError}>{billingError || purchase.purchaseError}</Text> : null}
          {purchase.purchaseMessage ? <Text style={{ color: prefs.colors.success, fontSize: 12, fontWeight: "800", textAlign: "center" }}>{purchase.purchaseMessage}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={handlePrimaryAction}
            style={({ pressed }) => [{
              alignItems: "center",
              backgroundColor: selectedKey === currentKey ? prefs.colors.elevated : prefs.colors.accent,
              borderColor: selectedKey === currentKey ? prefs.colors.border : prefs.colors.borderStrong,
              borderRadius: 999,
              borderWidth: 1,
              flexDirection: "row",
              gap: 8,
              justifyContent: "center",
              minHeight: 52,
              opacity: pressed ? 0.86 : 1
            }]}
          >
            {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
            <Text style={{ color: selectedKey === currentKey && light ? prefs.colors.text : "#FFFFFF", fontSize: 15, fontWeight: "900" }}>
              {primaryLabel()}
            </Text>
          </Pressable>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 6, justifyContent: "center" }}>
            <Ionicons name="shield-checkmark" color={prefs.colors.dim} size={12} />
            <Text style={{ color: prefs.colors.dim, fontSize: 11, fontWeight: "700" }}>Cancel anytime. Plan access syncs to your account.</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
