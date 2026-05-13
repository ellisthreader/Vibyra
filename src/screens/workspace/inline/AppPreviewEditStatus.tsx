import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";

export type PreviewEditStatus = "idle" | "running" | "done" | "error";

export function AppPreviewEditStatus({
  doneMessage,
  modelLabel,
  status
}: {
  doneMessage?: string;
  modelLabel: string;
  status: PreviewEditStatus;
}) {
  const [displayStatus, setDisplayStatus] = useState<PreviewEditStatus>(status);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const translateY = useRef(new Animated.Value(-8)).current;
  const phases = useMemo(() => [
    "Reading your prompt",
    `Running ${modelLabel}`,
    "Preparing answer"
  ], [modelLabel]);

  useEffect(() => {
    if (status === "idle") {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: supportsNativeAnimation }),
        Animated.timing(translateY, { toValue: -8, duration: 260, useNativeDriver: supportsNativeAnimation })
      ]).start(() => setDisplayStatus("idle"));
      return;
    }
    setDisplayStatus(status);
    setPhaseIndex(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: status === "done" ? 1.04 : 1, damping: 14, stiffness: 180, useNativeDriver: supportsNativeAnimation }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: supportsNativeAnimation }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: supportsNativeAnimation })
    ]).start();
    if (status === "done") {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.08, damping: 9, stiffness: 200, useNativeDriver: supportsNativeAnimation }),
        Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 180, useNativeDriver: supportsNativeAnimation })
      ]).start();
    }
  }, [opacity, scale, status, translateY]);

  useEffect(() => {
    if (status !== "running") return undefined;
    const interval = setInterval(() => setPhaseIndex((index) => Math.min(index + 1, phases.length - 1)), 2300);
    return () => clearInterval(interval);
  }, [phases.length, status]);

  if (displayStatus === "idle") return null;

  const running = displayStatus === "running";
  const error = displayStatus === "error";
  const title = running ? phases[phaseIndex] : error ? "Preview update failed" : "AI update complete";
  const subtitle = running ? modelLabel : error ? "Check the chat for details" : (doneMessage || "I updated the preview and refreshed the live app.");

  return (
    <Animated.View pointerEvents="none" style={[
      statusStyles.pill,
      error ? statusStyles.pillError : null,
      { opacity, transform: [{ translateY }, { scale }] }
    ]}>
      {running ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
        <Ionicons name={error ? "alert-circle-outline" : "checkmark-circle"} color="#FFFFFF" size={19} />
      )}
      <Animated.View style={statusStyles.textStack}>
        <Text numberOfLines={1} style={statusStyles.title}>{title}</Text>
        <Text numberOfLines={2} style={statusStyles.subtitle}>{subtitle}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const statusStyles = StyleSheet.create({
  pill: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(10, 12, 20, 0.9)",
    borderColor: "rgba(163, 104, 255, 0.42)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    maxWidth: "88%",
    minHeight: 48,
    paddingHorizontal: 15,
    paddingVertical: 10,
    position: "absolute",
    top: 14,
    zIndex: 18
  },
  pillError: {
    borderColor: "rgba(255, 209, 102, 0.42)"
  },
  subtitle: {
    color: "#BDB6D2",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
    marginTop: 1
  },
  textStack: {
    flexShrink: 1,
    minWidth: 0
  },
  title: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900"
  }
});
