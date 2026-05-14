import React from "react";
import { Pressable, Text, View } from "react-native";
import { usePreferences } from "../../../../context/PreferencesContext";
import { BillingCycle } from "./types";

const PILL_BASE = {
  alignItems: "center" as const,
  borderRadius: 999,
  flex: 1,
  flexDirection: "row" as const,
  gap: 8,
  justifyContent: "center" as const,
  paddingVertical: 10
};

export function BillingCycleToggle({ cycle, onChange }: { cycle: BillingCycle; onChange: (next: BillingCycle) => void }) {
  const prefs = usePreferences();
  const { t } = prefs;
  const light = prefs.effectiveScheme === "light";
  return (
    <View style={{
      backgroundColor: light ? prefs.colors.elevated : "rgba(15, 15, 24, 0.92)",
      borderColor: light ? prefs.colors.border : "rgba(139, 92, 255, 0.18)",
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      padding: 4
    }}>
      <Pressable onPress={() => onChange("monthly")} style={[PILL_BASE, cycle === "monthly" ? { backgroundColor: light ? prefs.colors.surface : "rgba(255,255,255,0.08)" } : null]}>
        <Text style={{ color: cycle === "monthly" ? (light ? prefs.colors.text : "#FFFFFF") : (light ? prefs.colors.muted : "#9C97AE"), fontSize: 13, fontWeight: "800" }}>{t("billing.monthly")}</Text>
      </Pressable>
      <Pressable onPress={() => onChange("annual")} style={[PILL_BASE, cycle === "annual" ? { backgroundColor: light ? prefs.colors.accentSoft : "rgba(194,89,255,0.22)" } : null]}>
        <Text style={{ color: cycle === "annual" ? (light ? prefs.colors.accent : "#FFFFFF") : (light ? prefs.colors.muted : "#9C97AE"), fontSize: 13, fontWeight: "800" }}>{t("billing.annual")}</Text>
        <View style={{
          backgroundColor: cycle === "annual" ? (light ? prefs.colors.warning : "#FFD166") : prefs.colors.warningSoft,
          borderRadius: 999,
          paddingHorizontal: 7,
          paddingVertical: 2
        }}>
          <Text style={{ color: cycle === "annual" ? (light ? "#FFFFFF" : "#1A0E33") : prefs.colors.warning, fontSize: 10, fontWeight: "900", letterSpacing: 0.3 }}>{t("billing.twoMonthsFree")}</Text>
        </View>
      </Pressable>
    </View>
  );
}
