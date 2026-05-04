import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../styles/theme";

type Props = {
  count: number;
  lastEarned: number;
  longestPromptLength: number;
  onReset: () => void;
  total: number;
};

const milestone = 10;

export function PromptMoneyCounter(props: Props) {
  const progress = Math.min(1, props.total / milestone);
  const lastEarned = props.lastEarned > 0 ? formatMoney(props.lastEarned) : "£0.00";

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="cash-outline" color="#101612" size={20} />
          </View>
          <View>
            <Text style={styles.eyebrow}>Code X prompt jar</Text>
            <Text style={styles.title}>{formatMoney(props.total)}</Text>
          </View>
        </View>

        <Pressable style={styles.resetButton} onPress={props.onReset}>
          <Ionicons name="refresh" color="#D5FFE2" size={16} />
          <Text style={styles.resetText}>Reset</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <Stat label="Prompts" value={`${props.count}`} />
        <Stat label="Last" value={lastEarned} />
        <Stat label="Longest" value={`${props.longestPromptLength} chars`} />
      </View>

      <View style={styles.trackWrap}>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.trackLabel}>{formatMoney(milestone - Math.min(props.total, milestone))} to £10</Text>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function formatMoney(value: number) {
  return `£${value.toFixed(2)}`;
}

const styles = StyleSheet.create({
  eyebrow: {
    color: "#A5F3C7",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: "#A7F3D0",
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
    shadowColor: "#34D399",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    width: 40
  },
  panel: {
    backgroundColor: "#08110D",
    borderColor: "rgba(167, 243, 208, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    overflow: "hidden",
    padding: 14
  },
  resetButton: {
    alignItems: "center",
    backgroundColor: "rgba(167, 243, 208, 0.08)",
    borderColor: "rgba(167, 243, 208, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  resetText: {
    color: "#D5FFE2",
    fontSize: 12,
    fontWeight: "900"
  },
  stat: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 58,
    padding: 10
  },
  statLabel: {
    color: colors.dim,
    fontSize: 11,
    fontWeight: "800"
  },
  statValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 5
  },
  statsRow: {
    flexDirection: "row",
    gap: 8
  },
  title: {
    color: colors.text,
    fontSize: 29,
    fontWeight: "900",
    lineHeight: 34
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  track: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    height: 8,
    overflow: "hidden"
  },
  trackFill: {
    backgroundColor: "#A7F3D0",
    borderRadius: 999,
    height: 8
  },
  trackLabel: {
    color: "#BAE7CB",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 7
  },
  trackWrap: {
    width: "100%"
  }
});
