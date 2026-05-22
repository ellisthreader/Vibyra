import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { ChatRunStatus } from "../../../types/domain";
import { chatToolStageIndex } from "../../../utils/chatToolProgress";
import { createThemedStyleSheet } from "../styles/themeTransform";
import { chatToolStrongColors } from "./chatAttachmentTools";

export function ChatToolActivityCard({ status }: { status: ChatRunStatus }) {
  const [now, setNow] = useState(() => Date.now());
  const pulse = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const meta = useMemo(() => toolMeta(status.tool), [status.tool]);

  useEffect(() => {
    if (status.status !== "running") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [status.status]);

  useEffect(() => {
    if (status.status !== "running") return;
    const loop = Animated.parallel([
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 820, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulse, { toValue: 0, duration: 820, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" })
      ])),
      Animated.loop(Animated.timing(rotate, { toValue: 1, duration: 2100, easing: Easing.linear, useNativeDriver: Platform.OS !== "web" }))
    ]);
    loop.start();
    return () => loop.stop();
  }, [pulse, rotate, status.status]);

  const elapsedMs = Math.max(0, (status.completedAt ?? now) - status.startedAt);
  const stage = toolStage(status.tool, elapsedMs);
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.88] });
  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={[styles.card, { borderColor: meta.borderColor }]}>
      <LinearGradient colors={meta.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.iconRing, { opacity: ringOpacity, transform: [{ rotate: spin }] }]} />
        <View style={[styles.iconCore, { backgroundColor: meta.iconBackground, borderColor: meta.borderColor }]}>
          <Ionicons name={meta.icon} color={meta.iconColor} size={15} />
        </View>
      </View>
      <View style={styles.body}>
        <Text style={[styles.kicker, { color: meta.kickerColor }]}>{meta.kicker}</Text>
        <Text numberOfLines={1} style={styles.title}>{meta.title}</Text>
        <Text numberOfLines={1} style={styles.detail}>{stage?.label ?? meta.detail}</Text>
        {stage ? <ToolStageRail activeIndex={stage.index} color={meta.stageColor} stages={stage.stages} /> : null}
      </View>
      <Text style={styles.timer}>{formatElapsed(Math.floor(elapsedMs / 1000))}</Text>
    </View>
  );
}

function ToolStageRail({ activeIndex, color, stages }: { activeIndex: number; color: string; stages: readonly string[] }) {
  return (
    <View style={styles.stageRow}>
      {stages.map((stage, index) => (
        <View
          key={stage}
          style={[
            styles.stageDot,
            index <= activeIndex && { backgroundColor: `${color}8A` },
            index === activeIndex && { backgroundColor: color, width: 24 }
          ]}
        />
      ))}
    </View>
  );
}

const DEFAULT_TOOL_COLORS = {
  accent: "#A855F7",
  border: "rgba(168, 85, 247, 0.3)",
  iconBackground: "rgba(124, 58, 237, 0.16)",
  iconColor: "#EDE2FF"
};

function toolMeta(tool: ChatRunStatus["tool"]) {
  const colors = tool ? chatToolStrongColors[tool] : DEFAULT_TOOL_COLORS;
  switch (tool) {
    case "image":
      return {
        detail: "Preparing the visual result",
        gradient: ["rgba(124, 58, 237, 0.1)", "rgba(176, 132, 255, 0.04)"] as const,
        icon: "image-outline" as const,
        iconBackground: colors.iconBackground,
        iconColor: colors.iconColor,
        borderColor: colors.border,
        kicker: "Generating",
        kickerColor: colors.iconColor,
        stageColor: colors.accent,
        title: "Creating image"
      };
    case "research":
      return {
        detail: "Searching, comparing, and checking sources",
        gradient: ["rgba(124, 58, 237, 0.1)", "rgba(176, 132, 255, 0.04)"] as const,
        icon: "search-outline" as const,
        iconBackground: colors.iconBackground,
        iconColor: colors.iconColor,
        borderColor: colors.border,
        kicker: "Researching",
        kickerColor: colors.iconColor,
        stageColor: colors.accent,
        title: "Deep research"
      };
    case "web":
      return {
        detail: "Searching the web and reading results",
        gradient: ["rgba(124, 58, 237, 0.1)", "rgba(176, 132, 255, 0.04)"] as const,
        icon: "globe-outline" as const,
        iconBackground: colors.iconBackground,
        iconColor: colors.iconColor,
        borderColor: colors.border,
        kicker: "Agent Web Search",
        kickerColor: colors.iconColor,
        stageColor: colors.accent,
        title: "Searching web"
      };
    case "analyze":
      return {
        detail: "Reading project context and file snippets",
        gradient: ["rgba(124, 58, 237, 0.1)", "rgba(176, 132, 255, 0.04)"] as const,
        icon: "document-text-outline" as const,
        iconBackground: colors.iconBackground,
        iconColor: colors.iconColor,
        borderColor: colors.border,
        kicker: "Analyzing",
        kickerColor: colors.iconColor,
        stageColor: colors.accent,
        title: "Project files"
      };
    default:
      return {
        detail: "Working through the request",
        gradient: ["rgba(142, 60, 255, 0.16)", "rgba(57, 130, 255, 0.08)"] as const,
        icon: "sparkles-outline" as const,
        iconBackground: "rgba(176, 132, 255, 0.12)",
        iconColor: "#D7C4FF",
        borderColor: "rgba(196, 181, 253, 0.24)",
        kicker: "Working",
        kickerColor: "#B49CFF",
        stageColor: "#B49CFF",
        title: "Vibyra AI"
      };
  }
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

const TOOL_STAGES = {
  analyze: ["Preparing files", "Reading context", "Checking risks", "Writing findings"],
  image: ["Preparing brief", "Composing visual", "Rendering image", "Finishing result"],
  research: ["Preparing research", "Searching sources", "Reviewing findings", "Drafting response"],
  web: ["Preparing search", "Reading results", "Comparing sources", "Writing summary"]
} as const;

function toolStage(tool: ChatRunStatus["tool"], elapsedMs: number) {
  if (!tool || !(tool in TOOL_STAGES)) return null;
  const stages = TOOL_STAGES[tool as keyof typeof TOOL_STAGES];
  const index = chatToolStageIndex(elapsedMs);
  return { index, label: stages[index], stages };
}

const styles = createThemedStyleSheet({
  body: { flex: 1, minWidth: 0 },
  card: {
    alignItems: "center",
    backgroundColor: "rgba(15, 17, 26, 0.92)",
    borderColor: "rgba(176, 132, 255, 0.24)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  detail: { color: "#B9B5C8", fontSize: 12, fontWeight: "600", lineHeight: 17, marginTop: 1 },
  iconCore: { alignItems: "center", backgroundColor: "rgba(176, 132, 255, 0.12)", borderColor: "rgba(196, 181, 253, 0.24)", borderRadius: 10, borderWidth: 1, height: 32, justifyContent: "center", width: 32 },
  iconRing: { borderColor: "rgba(176, 132, 255, 0.34)", borderRadius: 15, borderRightColor: "transparent", borderWidth: 1.5, height: 39, position: "absolute", width: 39 },
  iconWrap: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
  kicker: { color: "#B49CFF", fontSize: 10, fontWeight: "900", letterSpacing: 0, textTransform: "uppercase" },
  stageDot: { backgroundColor: "rgba(180, 156, 255, 0.2)", borderRadius: 999, height: 5, width: 16 },
  stageRow: { alignItems: "center", flexDirection: "row", gap: 5, marginTop: 7 },
  timer: { color: "#C7C0D4", fontSize: 12, fontWeight: "900" },
  title: { color: "#F4F0FF", fontSize: 14, fontWeight: "900", lineHeight: 19, marginTop: 1 }
});
