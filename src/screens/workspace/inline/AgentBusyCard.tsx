import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AgentBusyInfo } from "../../../types/domain";
import { colors } from "../../../styles/theme";

export function AgentBusyCard({ busy }: { busy: AgentBusyInfo }) {
  const [now, setNow] = useState(() => Date.now());
  const [receivedAt] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsedSeconds = elapsedForBusy(busy, now, receivedAt);
  const reason = busy.reason === "lock"
    ? "Backend lock is still held"
    : busy.reason === "unreported"
      ? "Backend did not report the blocking run"
    : "Previous run is still marked active";
  const progress = typeof busy.progress === "number" ? Math.max(0, Math.min(100, Math.round(busy.progress))) : null;

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.header}>
        <View style={cardStyles.icon}>
          <Ionicons name="pulse-outline" color="#FFFFFF" size={18} />
        </View>
        <View style={cardStyles.heading}>
          <Text style={cardStyles.kicker}>AI request in progress</Text>
          <Text numberOfLines={2} style={cardStyles.title}>{busy.title || "Previous AI request"}</Text>
        </View>
      </View>

      <View style={cardStyles.metaGrid}>
        <Meta label="Where" value={busy.projectName || busy.projectPath || "Backend"} />
        <Meta label="Running" value={formatElapsed(elapsedSeconds)} />
        <Meta label="Model" value={busy.model || "AI model"} />
        <Meta label="Status" value={progress === null ? reason : `${progress}% complete`} />
      </View>

      {busy.projectPath ? <Text numberOfLines={1} style={cardStyles.path}>{busy.projectPath}</Text> : null}
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={cardStyles.meta}>
      <Text style={cardStyles.metaLabel}>{label}</Text>
      <Text numberOfLines={1} style={cardStyles.metaValue}>{value}</Text>
    </View>
  );
}

function elapsedForBusy(busy: AgentBusyInfo, now: number, receivedAt: number) {
  if (typeof busy.elapsedSeconds === "number") {
    return Math.max(0, Math.floor(busy.elapsedSeconds + (now - receivedAt) / 1000));
  }
  const source = busy.startedAt || busy.updatedAt;
  if (!source) return 0;
  const started = Date.parse(source);
  return Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(15, 17, 26, 0.94)",
    borderColor: "rgba(176, 132, 255, 0.24)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginTop: 10,
    overflow: "hidden",
    padding: 14
  },
  header: { alignItems: "center", flexDirection: "row", gap: 11 },
  heading: { flex: 1, minWidth: 0 },
  icon: {
    alignItems: "center",
    backgroundColor: "#8E3CFF",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  kicker: {
    color: "#D7C4FF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  meta: {
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 10,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    gap: 3,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaLabel: { color: "#8F8A9E", fontSize: 10.5, fontWeight: "900", textTransform: "uppercase" },
  metaValue: { color: "#EEE9FF", fontSize: 12.5, fontWeight: "800" },
  path: {
    color: "#9E98AD",
    fontFamily: "monospace",
    fontSize: 11.5,
    fontWeight: "700"
  },
  title: { color: colors.text, fontSize: 15.5, fontWeight: "900", lineHeight: 20 }
});
