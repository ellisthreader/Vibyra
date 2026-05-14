import React, { useState } from "react";
import { Linking, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppContext } from "../../../../context/AppContext";
import { usePreferences } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";
import { BillingCycleToggle } from "./BillingCycleToggle";
import { BillingPlanPager } from "./BillingPlanPager";
import { BillingCycle, PlanKey, nextRecommendedTier } from "./types";

const MANAGE_SUBSCRIPTION_URL = Platform.select({
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
  default: "https://apps.apple.com/account/subscriptions"
}) as string;

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

        <ScrollView
          contentContainerStyle={{ gap: 14, paddingHorizontal: 18, paddingBottom: Math.max(insets.bottom + 18, 24), paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          <BillingCycleToggle cycle={cycle} onChange={setCycle} />

          <BillingPlanPager
            cycle={cycle}
            currentKey={currentKey}
            recommendedKey={recommendedKey}
            onSelect={selectPlan}
            disabled
          />

          <View style={{ alignItems: "center", gap: 8, marginTop: 4 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 6, justifyContent: "center" }}>
              <Ionicons name="shield-checkmark" color="#7A7390" size={12} />
              <Text style={{ color: "#7A7390", fontSize: 11, fontWeight: "700" }}>Cancel anytime · Plan access syncs to your account</Text>
            </View>
            <Pressable
              accessibilityRole="link"
              hitSlop={10}
              onPress={() => { Linking.openURL(MANAGE_SUBSCRIPTION_URL).catch(() => {}); }}
            >
              <Text style={{ color: "#9C8BFF", fontSize: 12, fontWeight: "800", textDecorationLine: "underline" }}>
                Manage your subscription
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
