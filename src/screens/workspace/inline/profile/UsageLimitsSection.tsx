import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../../../context/AppContext";
import { usePreferences, useThemedColor } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";

type Preferences = ReturnType<typeof usePreferences>;

export function UsageLimitsSection() {
  const app = useAppContext();
  const prefs = usePreferences();
  const tint = useThemedColor("#C259FF");
  const rows = [
    limitRow(
      prefs.t("usage.limit5Hour"),
      app.burstCreditsUsed,
      app.burstCreditsCap,
      app.burstCreditsResetAt,
      `${app.burstWindowHours || 5}h ${prefs.t("usage.window")}`,
      "flash-outline",
      prefs
    ),
    limitRow(
      prefs.t("usage.limitWeekly"),
      app.weeklyCreditsUsed,
      app.weeklyCreditsCap,
      app.weeklyCreditsResetAt,
      prefs.t("usage.limit7dCap"),
      "calendar-outline",
      prefs
    )
  ];

  return (
    <View style={styles.usageFlatSection}>
      <View style={styles.usageSectionHeader}>
        <Text style={styles.usageSectionTitle}>{prefs.t("usage.limits")}</Text>
        <Text style={styles.usageSectionMeta}>{prefs.t("usage.history")}</Text>
      </View>
      {rows.map((row, index) => (
        <View key={row.label} style={[styles.usageListRow, index === rows.length - 1 ? styles.usageListRowLast : null]}>
          <Ionicons name={row.icon} color={tint} size={19} />
          <View style={styles.usageListBody}>
            <Text numberOfLines={1} style={styles.usageListTitle}>{row.label}</Text>
            <Text numberOfLines={1} style={styles.usageListSub}>{row.resetLabel}</Text>
            <View style={localStyles.track}>
              <View style={[localStyles.fill, { backgroundColor: tint, width: `${row.percent}%` }]} />
            </View>
          </View>
          <View style={styles.usageListMeta}>
            <Text style={styles.usageListCount}>{prefs.formatNumber(row.used)} / {prefs.formatNumber(row.cap)}</Text>
            <Text style={styles.usageListMetaLabel}>{row.caption}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function limitRow(
  label: string,
  used: number,
  cap: number,
  resetAt: string | null,
  caption: string,
  icon: keyof typeof Ionicons.glyphMap,
  prefs: Preferences
) {
  const safeCap = Math.max(cap, 0);
  const safeUsed = Math.max(0, used);
  return {
    label,
    caption,
    used: safeUsed,
    cap: safeCap,
    icon,
    percent: safeCap > 0 ? Math.min(100, Math.max(3, Math.round((safeUsed / safeCap) * 100))) : 3,
    resetLabel: resetAt ? `${prefs.t("usage.resets")} ${formatReset(resetAt)}` : prefs.t("usage.resetAfterFirstUse")
  };
}

function formatReset(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

const localStyles = StyleSheet.create({
  fill: {
    borderRadius: 999,
    height: 5
  },
  track: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    height: 5,
    marginTop: 7,
    overflow: "hidden"
  }
});
