import React from "react";
import { Pressable, Text, View } from "react-native";
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
  return (
    <View style={{
      backgroundColor: "rgba(15, 15, 24, 0.92)",
      borderColor: "rgba(139, 92, 255, 0.18)",
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      padding: 4
    }}>
      <Pressable onPress={() => onChange("monthly")} style={[PILL_BASE, cycle === "monthly" ? { backgroundColor: "rgba(255,255,255,0.08)" } : null]}>
        <Text style={{ color: cycle === "monthly" ? "#FFFFFF" : "#9C97AE", fontSize: 13, fontWeight: "800" }}>Monthly</Text>
      </Pressable>
      <Pressable onPress={() => onChange("annual")} style={[PILL_BASE, cycle === "annual" ? { backgroundColor: "rgba(194,89,255,0.22)" } : null]}>
        <Text style={{ color: cycle === "annual" ? "#FFFFFF" : "#9C97AE", fontSize: 13, fontWeight: "800" }}>Annual</Text>
        <View style={{
          backgroundColor: cycle === "annual" ? "#FFD166" : "rgba(255, 209, 102, 0.18)",
          borderRadius: 999,
          paddingHorizontal: 7,
          paddingVertical: 2
        }}>
          <Text style={{ color: cycle === "annual" ? "#1A0E33" : "#FFD166", fontSize: 10, fontWeight: "900", letterSpacing: 0.3 }}>2 MONTHS FREE</Text>
        </View>
      </Pressable>
    </View>
  );
}
