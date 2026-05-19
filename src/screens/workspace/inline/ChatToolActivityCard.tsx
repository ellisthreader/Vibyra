import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { ChatRunStatus } from "../../../types/domain";
import { createThemedStyleSheet } from "../styles/themeTransform";

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

  const elapsedSeconds = Math.max(0, Math.floor(((status.completedAt ?? now) - status.startedAt) / 1000));
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.88] });
  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={styles.card}>
      <LinearGradient colors={meta.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.iconRing, { opacity: ringOpacity, transform: [{ rotate: spin }] }]} />
        <View style={styles.iconCore}>
          <Ionicons name={meta.icon} color="#FFFFFF" size={15} />
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.kicker}>{meta.kicker}</Text>
        <Text numberOfLines={1} style={styles.title}>{meta.title}</Text>
        <Text numberOfLines={1} style={styles.detail}>{meta.detail}</Text>
      </View>
      <Text style={styles.timer}>{formatElapsed(elapsedSeconds)}</Text>
    </View>
  );
}

function toolMeta(tool: ChatRunStatus["tool"]) {
  switch (tool) {
    case "image":
      return {
        detail: "Preparing the visual result",
        gradient: ["rgba(236, 85, 135, 0.18)", "rgba(142, 60, 255, 0.08)"] as const,
        icon: "image-outline" as const,
        kicker: "Generating",
        title: "Creating image"
      };
    case "research":
      return {
        detail: "Searching, comparing, and checking sources",
        gradient: ["rgba(84, 168, 255, 0.18)", "rgba(142, 60, 255, 0.08)"] as const,
        icon: "search-outline" as const,
        kicker: "Researching",
        title: "Deep research"
      };
    case "web":
      return {
        detail: "Searching the web and reading results",
        gradient: ["rgba(64, 198, 156, 0.18)", "rgba(57, 130, 255, 0.08)"] as const,
        icon: "globe-outline" as const,
        kicker: "Searching",
        title: "Agent web search"
      };
    case "analyze":
      return {
        detail: "Reading project context and file snippets",
        gradient: ["rgba(255, 185, 84, 0.17)", "rgba(142, 60, 255, 0.08)"] as const,
        icon: "document-text-outline" as const,
        kicker: "Analyzing",
        title: "Project files"
      };
    default:
      return {
        detail: "Working through the request",
        gradient: ["rgba(142, 60, 255, 0.16)", "rgba(57, 130, 255, 0.08)"] as const,
        icon: "sparkles-outline" as const,
        kicker: "Working",
        title: "Vibyra AI"
      };
  }
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

const styles = createThemedStyleSheet({
  body: { flex: 1, minWidth: 0 },
  card: {
    alignItems: "center",
    backgroundColor: "rgba(15, 17, 26, 0.9)",
    borderColor: "rgba(176, 132, 255, 0.22)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    marginTop: 3,
    overflow: "hidden",
    paddingHorizontal: 11,
    paddingVertical: 10
  },
  detail: { color: "#AFA7C2", fontSize: 11.5, fontWeight: "700", lineHeight: 17, marginTop: 1 },
  iconCore: {
    alignItems: "center",
    backgroundColor: "rgba(142, 60, 255, 0.88)",
    borderRadius: 12,
    height: 35,
    justifyContent: "center",
    width: 35
  },
  iconRing: {
    borderColor: "rgba(235, 220, 255, 0.74)",
    borderRadius: 15,
    borderRightColor: "transparent",
    borderWidth: 2,
    height: 43,
    position: "absolute",
    width: 43
  },
  iconWrap: { alignItems: "center", height: 45, justifyContent: "center", width: 45 },
  kicker: { color: "#D7C4FF", fontSize: 10, fontWeight: "900", letterSpacing: 0, textTransform: "uppercase" },
  timer: { color: "#C7C0D4", fontSize: 12, fontWeight: "900" },
  title: { color: "#F7F3FF", fontSize: 14, fontWeight: "900", lineHeight: 19, marginTop: 1 }
});
