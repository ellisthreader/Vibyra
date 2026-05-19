import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../../context/AppContext";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";

export function PcPermissionUsageLimits() {
  const app = useAppContext();
  const prefs = usePreferences();
  const [open, setOpen] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const accent = useThemedColor("#C259FF");
  const palette = prefs.effectiveScheme === "light" ? lightPalette : darkPalette;
  const rows = useMemo(() => [
    makeLimit(`${app.burstWindowHours || 5} hr`, app.burstCreditsUsed, app.burstCreditsCap, app.burstCreditsResetAt),
    makeLimit("Weekly", app.weeklyCreditsUsed, app.weeklyCreditsCap, app.weeklyCreditsResetAt)
  ], [
    app.burstCreditsCap,
    app.burstCreditsResetAt,
    app.burstCreditsUsed,
    app.burstWindowHours,
    app.weeklyCreditsCap,
    app.weeklyCreditsResetAt,
    app.weeklyCreditsUsed
  ]);

  useEffect(() => {
    Animated.spring(progress, {
      toValue: open ? 1 : 0,
      damping: 18,
      mass: 0.75,
      stiffness: 190,
      useNativeDriver: false
    }).start();
  }, [open, progress]);

  const maxHeight = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 132] });
  const opacity = progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.4, 1] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <View style={[localStyles.shell, { borderColor: palette.border }]}>
      <Pressable onPress={() => setOpen((value) => !value)} style={({ pressed }) => [localStyles.trigger, pressed && localStyles.pressed]}>
        <View style={[localStyles.iconWrap, { backgroundColor: palette.iconBg }]}>
          <Ionicons name="speedometer-outline" color={accent} size={15} />
        </View>
        <View style={localStyles.triggerCopy}>
          <Text style={[localStyles.title, { color: palette.text }]}>Usage remaining</Text>
          <Text numberOfLines={1} style={[localStyles.meta, { color: palette.muted }]}>
            {rows.map((row) => `${row.label} ${row.percentLeft}%`).join(" · ")}
          </Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" color={palette.muted} size={17} />
        </Animated.View>
      </Pressable>
      <Animated.View style={[localStyles.details, { maxHeight, opacity, transform: [{ translateY }] }]}>
        {rows.map((row) => (
          <View key={row.label} style={localStyles.limitRow}>
            <View style={localStyles.limitTop}>
              <Text style={[localStyles.limitLabel, { color: palette.text }]}>{row.label}</Text>
              <Text style={[localStyles.limitValue, { color: palette.text }]}>{row.percentLeft}% left</Text>
            </View>
            <View style={[localStyles.track, { backgroundColor: palette.track }]}>
              <View style={[localStyles.fill, { backgroundColor: accent, width: `${row.fill}%` }]} />
            </View>
            <Text numberOfLines={1} style={[localStyles.reset, { color: palette.muted }]}>{formatReset(row.resetAt)}</Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

function makeLimit(label: string, used: number, cap: number, resetAt: string | null) {
  const safeCap = Math.max(0, cap);
  const remaining = safeCap > 0 ? Math.max(0, safeCap - Math.max(0, used)) : 0;
  const ratio = safeCap > 0 ? remaining / safeCap : 1;
  const percentLeft = safeCap > 0 ? Math.max(0, Math.min(100, Math.round(ratio * 100))) : 100;
  return {
    fill: percentLeft === 0 ? 0 : Math.max(4, percentLeft),
    label,
    percentLeft,
    resetAt
  };
}

function formatReset(value: string | null) {
  if (!value) return "Resets after first use";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `Resets ${value}`;
  return `Resets ${date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

const localStyles = StyleSheet.create({
  details: { gap: 10, overflow: "hidden" },
  fill: { borderRadius: 999, height: 5 },
  iconWrap: { alignItems: "center", borderRadius: 999, height: 26, justifyContent: "center", width: 26 },
  limitLabel: { fontSize: 12, fontWeight: "900", lineHeight: 16 },
  limitRow: { gap: 5, paddingHorizontal: 7 },
  limitTop: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  limitValue: { flexShrink: 1, fontSize: 11.5, fontWeight: "800", lineHeight: 15, textAlign: "right" },
  meta: { fontSize: 11, fontWeight: "700", lineHeight: 15 },
  pressed: { opacity: 0.78 },
  reset: { fontSize: 10.5, fontWeight: "700", lineHeight: 14 },
  shell: { borderTopWidth: 1, marginTop: 4, paddingTop: 6 },
  title: { fontSize: 12.5, fontWeight: "900", lineHeight: 16 },
  track: { borderRadius: 999, height: 5, overflow: "hidden" },
  trigger: { alignItems: "center", flexDirection: "row", gap: 8, minHeight: 40, paddingHorizontal: 7, paddingVertical: 5 },
  triggerCopy: { flex: 1, minWidth: 0 }
});

const darkPalette = {
  border: "rgba(176, 132, 255, 0.16)",
  iconBg: "rgba(194, 89, 255, 0.12)",
  muted: "#9E98B1",
  text: "#F3F1FA",
  track: "rgba(255, 255, 255, 0.08)"
};

const lightPalette = {
  border: "rgba(109, 59, 255, 0.12)",
  iconBg: "rgba(109, 59, 255, 0.1)",
  muted: "#6B647C",
  text: "#312A46",
  track: "rgba(109, 59, 255, 0.11)"
};
