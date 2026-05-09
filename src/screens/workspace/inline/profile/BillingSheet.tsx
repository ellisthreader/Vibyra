import React, { useState } from "react";
import { Linking, Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../../../context/AppContext";
import { usePreferences } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";
import { BillingCycleToggle } from "./BillingCycleToggle";
import { BillingPlanPager } from "./BillingPlanPager";
import { BillingCycle, PlanKey, nextRecommendedTier } from "./types";
import { openBillingPortal, startStripeCheckout } from "../../../../utils/billingApi";

export function BillingSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const app = useAppContext();
  const prefs = usePreferences();
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
            <Ionicons name="arrow-back" color={prefs.effectiveScheme === "light" ? "#0A0814" : "#FFFFFF"} size={24} />
          </Pressable>
          <Text style={styles.billingHeaderTitle}>{prefs.t("billing.title")}</Text>
          <View style={styles.billingHeaderTokens}>
            <Ionicons name="flash" color="#FFD166" size={13} />
            <Text style={styles.billingHeaderTokensText}>{prefs.formatNumber(app.creditsBalance)} {prefs.t("billing.tokens")}</Text>
          </View>
        </View>

        <View style={{ flex: 1, gap: 12, paddingHorizontal: 18, paddingBottom: 16 }}>
          <BillingCycleToggle cycle={cycle} onChange={setCycle} />

          <BillingPlanPager
            cycle={cycle}
            currentKey={currentKey}
            recommendedKey={recommendedKey}
            onSelect={selectPlan}
            busy={busy}
          />

          <View style={{ alignItems: "center", gap: 4 }}>
            {error ? (
              <Pressable onPress={managePayments} style={styles.billingFooter}>
                <Ionicons name="information-circle" color="#5E8BFF" size={16} />
                <Text style={styles.billingError}>{error}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={managePayments} style={styles.billingFooter}>
                <Ionicons name="card-outline" color="#9C97AE" size={14} />
                <Text style={styles.billingFooterText}>{prefs.t("billing.manage")}</Text>
                <Ionicons name="chevron-forward" color="#9C97AE" size={14} />
              </Pressable>
            )}
            <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
              <Ionicons name="lock-closed" color="#5C5870" size={10} />
              <Text style={{ color: "#5C5870", fontSize: 10, fontWeight: "700" }}>{prefs.t("billing.secure")}</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
