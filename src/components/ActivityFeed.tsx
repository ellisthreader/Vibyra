import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../styles/theme";
import { LogEvent } from "../types/domain";

export function ActivityFeed({ logs }: { logs: LogEvent[] }) {
  return (
    <View style={styles.feed}>
      {logs.map((log) => (
        <View key={log.id} style={styles.logRow}>
          <View style={[styles.logDot, { backgroundColor: toneColor(log.tone) }]} />
          <View style={styles.rowContent}>
            <Text style={styles.logMessage}>{log.message}</Text>
            <Text style={styles.rowMeta}>{log.source} - {log.time}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function toneColor(tone: LogEvent["tone"]) {
  if (tone === "success") return colors.success;
  if (tone === "warning") return colors.warning;
  if (tone === "error") return colors.error;
  return colors.accent;
}

const styles = StyleSheet.create({
  feed: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8
  },
  logDot: {
    borderRadius: 4,
    height: 8,
    marginTop: 7,
    width: 8
  },
  logMessage: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600"
  },
  logRow: {
    alignItems: "flex-start",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14
  },
  rowContent: {
    flex: 1,
    minWidth: 0
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 3
  }
});
