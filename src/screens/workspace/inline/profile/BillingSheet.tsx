import React, { useState } from "react";
import { Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../../../context/AppContext";
import { styles } from "../../styles";
import { CurrentPlanCard } from "./CurrentPlanCard";
import { BillingCycleToggle } from "./BillingCycleToggle";
import { BillingPlanPager } from "./BillingPlanPager";
import { BillingCycle, PlanKey, nextRecommendedTier } from "./types";
import { openBillingPortal, startStripeCheckout } from "../../../../utils/billingApi";

export function BillingSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const app = useAppContext();
  const currentKey = (app.accountPlan.trim().toLowerCase() || "free") as PlanKey;
  const recommendedKey = currentKey === "pro" ? "pro" : nextRecommendedTier(currentKey);
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function selectPlan(key: PlanKey, chosenCycle: BillingCycle) {
    if (key === "free" || key === currentKey) { onClose(); return; }
    setError("");
    if (!app.authToken) {
      Linking.openURL(`https://vibyra.app/billing/upgrade?plan=${encodeURIComponent(key)}&cycle=${chosenCycle}`).catch(() => undefined);
      onClose();
      return;
    }
    try {
      setBusy(true);
      const result = await startStripeCheckout(app.authToken, {
        kind: "subscription",
        plan: key as "starter" | "builder" | "pro",
        cycle: chosenCycle
      });
      await Linking.openURL(result.url);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stripe is not configured on the backend.");
    } finally {
      setBusy(false);
    }
  }

  async function managePayments() {
    if (!app.authToken) { Linking.openURL("https://vibyra.app/billing/manage").catch(() => undefined); return; }
    try {
      const result = await openBillingPortal(app.authToken);
      await Linking.openURL(result.url);
    } catch {
      Linking.openURL("https://vibyra.app/billing/manage").catch(() => undefined);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <View style={styles.billingScreen}>
        <View style={styles.billingHeader}>
          <Pressable accessibilityLabel="Back" onPress={onClose} style={styles.billingHeaderBack}>
            <Ionicons name="arrow-back" color="#FFFFFF" size={24} />
          </Pressable>
          <Text style={styles.billingHeaderTitle}>Pick your plan</Text>
          <View style={styles.billingHeaderTokens}>
            <Ionicons name="flash" color="#FFD166" size={13} />
            <Text style={styles.billingHeaderTokensText}>{app.creditsBalance.toLocaleString()} tokens</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: 18 }}>
            <CurrentPlanCard />
          </View>

          <View style={{ paddingHorizontal: 18 }}>
            <BillingCycleToggle cycle={cycle} onChange={setCycle} />
          </View>

          <BillingPlanPager
            cycle={cycle}
            currentKey={currentKey}
            recommendedKey={recommendedKey}
            onSelect={selectPlan}
            busy={busy}
          />

          <View style={{ paddingHorizontal: 18 }}>
            {error ? (
              <Pressable onPress={managePayments} style={styles.billingFooter}>
                <Ionicons name="information-circle" color="#5E8BFF" size={16} />
                <Text style={styles.billingError}>{error}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={managePayments} style={styles.billingFooter}>
                <Ionicons name="card-outline" color="#9C97AE" size={14} />
                <Text style={styles.billingFooterText}>Manage payment & invoices</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
