import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../../styles/theme";
import type { ChatMessage } from "../../../types/domain";

type Prompt = NonNullable<ChatMessage["desktopConnection"]>;

export function DesktopConnectionCard({ prompt, onConnect, onScan }: {
  prompt: Prompt;
  onConnect?: (prompt: Prompt) => void;
  onScan?: (prompt: Prompt) => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const query = prompt.query?.trim();
  const stage = prompt.stage ?? (connecting ? "pair" : "connect");
  const pairActive = stage === "pair" || stage === "open";
  const openActive = stage === "open";
  const opensKnownProject = prompt.reason === "desktop-browse";
  const title = stage === "open"
    ? query ? `Opening "${query}"` : "Opening folder"
    : stage === "pair"
      ? "Pair Vibyra Desktop"
      : opensKnownProject && query ? `Ready to open "${query}"` : query ? `Ready to search "${query}"` : "Connect your PC";
  const actionText = stage === "open" ? "Opening..." : stage === "pair" ? "Pairing..." : "Connect PC";

  useEffect(() => {
    const pulseLoop = Animated.loop(Animated.timing(pulse, {
      duration: 1800,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: Platform.OS !== "web"
    }));
    const sweepLoop = Animated.loop(Animated.timing(sweep, {
      duration: 2200,
      easing: Easing.inOut(Easing.quad),
      toValue: 1,
      useNativeDriver: Platform.OS !== "web"
    }));
    pulseLoop.start();
    sweepLoop.start();
    return () => {
      pulseLoop.stop();
      sweepLoop.stop();
    };
  }, [pulse, sweep]);

  const handleConnect = () => {
    setConnecting(true);
    onConnect?.(prompt);
  };

  const ringStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.48, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }]
  };
  const beamStyle = {
    transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-120, 180] }) }]
  };

  return (
    <View style={styles.card}>
      <Animated.View pointerEvents="none" style={[styles.sweep, beamStyle]} />
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Animated.View style={[styles.ring, ringStyle]} />
          <LinearGradient colors={["#B084FF", "#8E3CFF", "#5D24D8"]} style={styles.icon}>
            <Ionicons name="desktop-outline" color="#FFFFFF" size={22} />
          </LinearGradient>
        </View>
        <View style={styles.copy}>
          <Text style={styles.kicker}>PC connection needed</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {opensKnownProject
              ? "After pairing, Vibyra will check the framework and app type automatically."
              : query ? "After pairing, Vibyra will continue this request and show the same folder confirmation UI." : "Pair Vibyra Desktop to browse and open folders from chat."}
          </Text>
        </View>
      </View>

      <View style={styles.flow}>
        <Step active icon="phone-portrait-outline" text="Phone" />
        <FlowLine />
        <Step active={pairActive} icon="wifi-outline" text="Pair" />
        <FlowLine />
        <Step active={openActive} icon="folder-open-outline" text={query ? "Open" : "Browse"} />
      </View>

      <View style={styles.actions}>
        <ActionButton icon="search-outline" text="Scan Wi-Fi" tone="ghost" onPress={() => { setConnecting(true); onScan?.(prompt); }} />
        <ActionButton icon="desktop-outline" text={actionText} tone="primary" onPress={handleConnect} />
      </View>
    </View>
  );
}

function Step({ active, icon, text }: { active?: boolean; icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={[styles.step, active ? styles.stepActive : null]}>
      <Ionicons name={icon} color={active ? "#FFFFFF" : "#D7C4FF"} size={13} />
      <Text style={[styles.stepText, active ? styles.stepTextActive : null]}>{text}</Text>
    </View>
  );
}

function FlowLine() {
  return <View style={styles.flowLine} />;
}

function ActionButton({ icon, text, tone, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  tone: "ghost" | "primary";
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, tone === "primary" ? styles.buttonPrimary : styles.buttonGhost, pressed ? styles.buttonPressed : null]}>
      <Ionicons name={icon} color={tone === "primary" ? "#FFFFFF" : "#D5D0E6"} size={14} />
      <Text style={tone === "primary" ? styles.buttonPrimaryText : styles.buttonGhostText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  button: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 38, paddingHorizontal: 13, paddingVertical: 9 },
  buttonGhost: { backgroundColor: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.14)", borderWidth: 1 },
  buttonGhostText: { color: "#D5D0E6", fontSize: 13, fontWeight: "800" },
  buttonPressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  buttonPrimary: { backgroundColor: "#8E3CFF", shadowColor: "#8E3CFF", shadowOpacity: 0.3, shadowRadius: 12 },
  buttonPrimaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  card: { backgroundColor: "rgba(15, 17, 26, 0.94)", borderColor: "rgba(176, 132, 255, 0.3)", borderRadius: 14, borderWidth: 1, gap: 13, marginTop: 10, overflow: "hidden", padding: 14 },
  copy: { flex: 1, minWidth: 0 },
  flow: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.035)", borderColor: "rgba(176,132,255,0.12)", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 7, padding: 8 },
  flowLine: { backgroundColor: "rgba(176,132,255,0.28)", flex: 1, height: 1, minWidth: 10 },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  icon: { alignItems: "center", borderRadius: 15, height: 46, justifyContent: "center", width: 46 },
  iconWrap: { alignItems: "center", height: 54, justifyContent: "center", width: 54 },
  kicker: { color: "#D7C4FF", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  ring: { backgroundColor: "rgba(142,60,255,0.24)", borderColor: "rgba(215,196,255,0.34)", borderRadius: 999, borderWidth: 1, height: 46, position: "absolute", width: 46 },
  step: { alignItems: "center", borderColor: "rgba(176,132,255,0.2)", borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 5, minHeight: 27, paddingHorizontal: 9 },
  stepActive: { backgroundColor: "rgba(142,60,255,0.72)", borderColor: "rgba(215,196,255,0.42)" },
  stepText: { color: "#D5D0E6", fontSize: 11, fontWeight: "800" },
  stepTextActive: { color: "#FFFFFF" },
  subtitle: { color: "#AFA9C2", fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 4 },
  sweep: { backgroundColor: "rgba(215,196,255,0.12)", bottom: -20, position: "absolute", top: -20, width: 58 },
  title: { color: colors.text, fontSize: 16, fontWeight: "900", marginTop: 2 }
});
