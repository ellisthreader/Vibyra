import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppContext } from "../../../../context/AppContext";
import { usePreferences } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";
import { BillingCycleToggle } from "./BillingCycleToggle";
import { BillingPlanPager } from "./BillingPlanPager";
import { CurrentPlanCard } from "./CurrentPlanCard";
import { BillingCycle, PlanKey, nextRecommendedTier } from "./types";

export function BillingSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const app = useAppContext();
  const prefs = usePreferences();
  const insets = useSafeAreaInsets();
  const currentKey = (app.accountPlan.trim().toLowerCase() || "free") as PlanKey;
  const recommendedKey = currentKey === "pro" ? "pro" : nextRecommendedTier(currentKey);
  const [cycle, setCycle] = useState<BillingCycle>("annual");

  function selectPlan(key: PlanKey) {
    if (key === "free" || key === currentKey) { onClose(); return; }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <View style={styles.billingScreen}>
        <View style={[styles.billingHeader, { paddingTop: Math.max(insets.top + 10, 24) }]}>
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
          <CurrentPlanCard />

          <BillingCycleToggle cycle={cycle} onChange={setCycle} />

          <BillingPlanPager
            cycle={cycle}
            currentKey={currentKey}
            recommendedKey={recommendedKey}
            onSelect={selectPlan}
            disabled
          />

          <View style={{ alignItems: "center", gap: 4 }}>
            <View style={styles.billingFooter}>
              <Ionicons name="information-circle" color="#5E8BFF" size={16} />
              <Text style={[styles.billingFooterText, { flex: 1, textAlign: "center" }]}>Mobile upgrades and payment management are not available in this build.</Text>
            </View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
              <Ionicons name="lock-closed" color="#5C5870" size={10} />
              <Text style={{ color: "#5C5870", fontSize: 10, fontWeight: "700" }}>Plan access updates after your account syncs.</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
