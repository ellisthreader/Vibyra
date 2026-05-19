import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { usePreferences } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";
import { BillingCycle, PlanKey, PlanTier } from "./types";
import { getDisplayPrice } from "./billingUtils";

const OPTION_ACCENTS: Record<PlanKey, { main: string; muted: string; wash: string }> = {
  free: { main: "#4ADE80", muted: "#A7F3D0", wash: "rgba(74, 222, 128, 0.14)" },
  starter: { main: "#C259FF", muted: "#D8B4FE", wash: "rgba(194, 89, 255, 0.15)" },
  builder: { main: "#38BDF8", muted: "#BAE6FD", wash: "rgba(56, 189, 248, 0.15)" },
  pro: { main: "#FFD166", muted: "#FDE68A", wash: "rgba(255, 209, 102, 0.15)" }
};

export function BillingPlanOption({
  cycle,
  isCurrent,
  isRecommended,
  isSelected,
  onPress,
  tier
}: {
  cycle: BillingCycle;
  isCurrent: boolean;
  isRecommended: boolean;
  isSelected: boolean;
  onPress: () => void;
  tier: PlanTier;
}) {
  const prefs = usePreferences();
  const display = getDisplayPrice(tier, cycle);
  const light = prefs.effectiveScheme === "light";
  const accent = OPTION_ACCENTS[tier.key];
  const selectedBg = light ? prefs.colors.surfaceTint : accent.wash;
  const baseBg = light ? prefs.colors.surface : "rgba(255, 255, 255, 0.045)";
  const borderColor = isSelected ? accent.main : light ? prefs.colors.border : "rgba(255, 255, 255, 0.09)";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.billingPlanOption,
        { backgroundColor: isSelected ? selectedBg : baseBg, borderColor },
        pressed ? styles.billingPlanOptionPressed : null
      ]}
    >
      <View style={[styles.billingPlanOptionIcon, { backgroundColor: tier.pillIconBg }]}>
        <Ionicons name={tier.pillIcon} color={tier.pillIconColor} size={18} />
      </View>

      <View style={styles.billingPlanOptionCopy}>
        <View style={styles.billingPlanOptionTitleRow}>
          <Text style={[styles.billingPlanOptionName, { color: isSelected ? accent.main : prefs.colors.text }]} numberOfLines={1}>{tier.name}</Text>
          {isCurrent || isRecommended ? (
            <Text style={[styles.billingPlanOptionBadge, { color: isCurrent ? prefs.colors.success : accent.main }]}>
              {isCurrent ? prefs.t("billing.current") : prefs.t("billing.recommended")}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.billingPlanOptionTagline, { color: isSelected ? accent.muted : prefs.colors.muted }]} numberOfLines={1}>{tier.tagline}</Text>
      </View>

      <View style={styles.billingPlanOptionPrice}>
        <Text style={[styles.billingPlanOptionPriceText, { color: isSelected ? accent.main : prefs.colors.text }]}>{display.price}</Text>
        <Text style={[styles.billingPlanOptionCadence, { color: isSelected ? accent.muted : prefs.colors.dim }]}>{display.cadence}</Text>
      </View>
    </Pressable>
  );
}
