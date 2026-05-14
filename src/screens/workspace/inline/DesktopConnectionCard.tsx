import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { ChatMessage } from "../../../types/domain";
import { useChatActionCardPalette } from "./chatActionCardTheme";

type Prompt = NonNullable<ChatMessage["desktopConnection"]>;
type Palette = ReturnType<typeof useChatActionCardPalette>;

export function DesktopConnectionCard({ prompt, onConnect, onScan }: {
  prompt: Prompt;
  onConnect?: (prompt: Prompt) => void;
  onScan?: (prompt: Prompt) => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const palette = useChatActionCardPalette();
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
    backgroundColor: palette.ringBg,
    borderColor: palette.ringBorder,
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.48, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }]
  };
  const beamStyle = {
    transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-120, 180] }) }]
  };

  return (
    <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
      <Animated.View pointerEvents="none" style={[styles.sweep, { backgroundColor: palette.sweep }, beamStyle]} />
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Animated.View style={[styles.ring, ringStyle]} />
          <LinearGradient colors={palette.iconGradient} style={styles.icon}>
            <Ionicons name="desktop-outline" color="#FFFFFF" size={22} />
          </LinearGradient>
        </View>
        <View style={styles.copy}>
          <Text style={[styles.kicker, { color: palette.kicker }]}>PC connection needed</Text>
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: palette.body }]}>
            {opensKnownProject
              ? "After pairing, Vibyra will check the framework and app type automatically."
              : query ? "After pairing, Vibyra will continue this request and show the same folder confirmation UI." : "Pair Vibyra Desktop to browse and open folders from chat."}
          </Text>
        </View>
      </View>

      <View style={[styles.flow, { backgroundColor: palette.panelBg, borderColor: palette.panelBorder }]}>
        <Step active icon="phone-portrait-outline" palette={palette} text="Phone" />
        <FlowLine palette={palette} />
        <Step active={pairActive} icon="wifi-outline" palette={palette} text="Pair" />
        <FlowLine palette={palette} />
        <Step active={openActive} icon="folder-open-outline" palette={palette} text={query ? "Open" : "Browse"} />
      </View>

      <View style={styles.actions}>
        <ActionButton icon="search-outline" palette={palette} text="Scan Wi-Fi" tone="ghost" onPress={() => { setConnecting(true); onScan?.(prompt); }} />
        <ActionButton icon="desktop-outline" palette={palette} text={actionText} tone="primary" onPress={handleConnect} />
      </View>
    </View>
  );
}

function Step({ active, icon, palette, text }: { active?: boolean; icon: keyof typeof Ionicons.glyphMap; palette: Palette; text: string }) {
  return (
    <View style={[
      styles.step,
      { borderColor: palette.stepBorder },
      active ? { backgroundColor: palette.stepActiveBg, borderColor: palette.stepActiveBorder } : null
    ]}>
      <Ionicons name={icon} color={active ? palette.primaryText : palette.kicker} size={13} />
      <Text style={[styles.stepText, { color: active ? palette.primaryText : palette.buttonGhostText }]}>{text}</Text>
    </View>
  );
}

function FlowLine({ palette }: { palette: Palette }) {
  return <View style={[styles.flowLine, { backgroundColor: palette.flowLine }]} />;
}

function ActionButton({ icon, palette, text, tone, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  palette: Palette;
  text: string;
  tone: "ghost" | "primary";
  onPress: () => void;
}) {
  const primary = tone === "primary";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? [styles.buttonPrimary, { backgroundColor: palette.buttonPrimary, shadowColor: palette.buttonPrimary }]
          : { backgroundColor: palette.buttonGhostBg, borderColor: palette.buttonGhostBorder, borderWidth: 1 },
        pressed ? styles.buttonPressed : null
      ]}
    >
      <Ionicons name={icon} color={primary ? palette.primaryText : palette.buttonGhostText} size={14} />
      <Text style={[primary ? styles.buttonPrimaryText : styles.buttonGhostText, { color: primary ? palette.primaryText : palette.buttonGhostText }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  button: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 38, paddingHorizontal: 13, paddingVertical: 9 },
  buttonGhostText: { fontSize: 13, fontWeight: "800" },
  buttonPressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  buttonPrimary: { shadowOpacity: 0.3, shadowRadius: 12 },
  buttonPrimaryText: { fontSize: 13, fontWeight: "900" },
  card: { borderRadius: 14, borderWidth: 1, gap: 13, marginTop: 10, overflow: "hidden", padding: 14 },
  copy: { flex: 1, minWidth: 0 },
  flow: { alignItems: "center", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 7, padding: 8 },
  flowLine: { flex: 1, height: 1, minWidth: 10 },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  icon: { alignItems: "center", borderRadius: 15, height: 46, justifyContent: "center", width: 46 },
  iconWrap: { alignItems: "center", height: 54, justifyContent: "center", width: 54 },
  kicker: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  ring: { borderRadius: 999, borderWidth: 1, height: 46, position: "absolute", width: 46 },
  step: { alignItems: "center", borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 5, minHeight: 27, paddingHorizontal: 9 },
  stepText: { fontSize: 11, fontWeight: "800" },
  subtitle: { fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 4 },
  sweep: { bottom: -20, position: "absolute", top: -20, width: 58 },
  title: { fontSize: 16, fontWeight: "900", marginTop: 2 }
});
