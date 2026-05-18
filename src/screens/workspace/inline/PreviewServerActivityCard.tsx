import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PreviewServerPrompt } from "../../../types/domain";
import { useChatActionCardPalette } from "./chatActionCardTheme";

export function PreviewServerActivityCard({ onApprove, onDeny, previewServer }: {
  onApprove?: () => void;
  onDeny?: () => void;
  previewServer: PreviewServerPrompt;
}) {
  const palette = useChatActionCardPalette();
  const blink = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const running = previewServer.status === "starting";

  useEffect(() => {
    if (!running) return;
    const blinkLoop = Animated.loop(Animated.sequence([
      Animated.timing(blink, { duration: 520, toValue: 1, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(blink, { duration: 520, toValue: 0, useNativeDriver: Platform.OS !== "web" })
    ]));
    const sweepLoop = Animated.loop(Animated.timing(sweep, {
      duration: 1800,
      easing: Easing.inOut(Easing.quad),
      toValue: 1,
      useNativeDriver: Platform.OS !== "web"
    }));
    blinkLoop.start();
    sweepLoop.start();
    return () => {
      blinkLoop.stop();
      sweepLoop.stop();
    };
  }, [blink, running, sweep]);

  const beamStyle = {
    transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-80, 220] }) }]
  };
  const terminalLines = linesForPreviewServer(previewServer);

  return (
    <View style={[
      styles.card,
      previewServer.status !== "approval" ? styles.terminalCard : null,
      { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }
    ]}>
      {running ? <Animated.View pointerEvents="none" style={[styles.sweep, { backgroundColor: palette.sweep }, beamStyle]} /> : null}
      {previewServer.status === "approval" ? (
        <>
          <View style={styles.header}>
            <View style={[styles.icon, { backgroundColor: palette.iconBg }]}>
              <Ionicons name="play-circle-outline" color={palette.iconColor} size={18} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.kicker, { color: palette.kicker }]}>Start phone preview?</Text>
              <Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>{previewServer.projectName}</Text>
            </View>
          </View>
          <Text style={[styles.body, { color: palette.body }]}>
            No running phone preview was found. Vibyra Desktop can start the project server and expose it safely through the desktop bridge.
          </Text>
          <View style={styles.actions}>
            <ActionButton label="No" onPress={onDeny} palette={palette} tone="ghost" />
            <ActionButton label="Yes, start it" onPress={onApprove} palette={palette} tone="primary" />
          </View>
        </>
      ) : null}
      {previewServer.status !== "approval" ? (
      <View style={[styles.terminal, { backgroundColor: palette.panelBg, borderColor: palette.panelBorder }]}>
        <View style={styles.terminalDots}>
          <View style={[styles.dot, { backgroundColor: "#FF6B7A" }]} />
          <View style={[styles.dot, { backgroundColor: "#FFD166" }]} />
          <View style={[styles.dot, { backgroundColor: "#7CF1B3" }]} />
        </View>
        {terminalLines.map((line) => (
          <Text key={line} style={[styles.line, { color: palette.body }]}>{line}</Text>
        ))}
        <View style={styles.statusRow}>
          <Text style={[styles.status, { color: palette.kicker }]}>{statusText(previewServer)}</Text>
          {running ? <Animated.View style={[styles.cursor, { backgroundColor: palette.kicker, opacity: blink }]} /> : null}
        </View>
      </View>
      ) : null}
    </View>
  );
}

function ActionButton({ label, onPress, palette, tone }: {
  label: string;
  onPress?: () => void;
  palette: ReturnType<typeof useChatActionCardPalette>;
  tone: "ghost" | "primary";
}) {
  const primary = tone === "primary";
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: palette.buttonPrimary } : { backgroundColor: palette.buttonGhostBg, borderColor: palette.buttonGhostBorder, borderWidth: 1 },
        pressed ? styles.buttonPressed : null
      ]}
    >
      <Text style={[styles.buttonText, { color: primary ? palette.primaryText : palette.buttonGhostText }]}>{label}</Text>
    </Pressable>
  );
}

function linesForPreviewServer(previewServer: PreviewServerPrompt) {
  const lines = ["$ POST /preview/start-server"];
  if (phaseAtLeast(previewServer.phase, "starting-server")) lines.push("$ desktop selected project preview route");
  if (phaseAtLeast(previewServer.phase, "verifying-phone")) lines.push("$ verifying phone can load route and assets");
  if (previewServer.status === "ready") lines.push("$ preview route ready");
  if (previewServer.status === "failed") lines.push(`$ failed: ${previewServer.detail ?? "preview server did not start"}`);
  if (previewServer.status === "cancelled") lines.push("$ cancelled");
  return lines;
}

function phaseAtLeast(current: PreviewServerPrompt["phase"], phase: PreviewServerPrompt["phase"]) {
  const order: PreviewServerPrompt["phase"][] = ["requesting-desktop", "starting-server", "verifying-phone", "ready"];
  return order.indexOf(current) >= order.indexOf(phase);
}

function statusText(previewServer: PreviewServerPrompt) {
  if (previewServer.status === "ready") return "done";
  if (previewServer.status === "failed") return "stopped";
  if (previewServer.status === "cancelled") return "cancelled";
  if (previewServer.phase === "verifying-phone") return "checking phone route";
  if (previewServer.phase === "starting-server") return "desktop is starting server";
  return "waiting for desktop";
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  body: { fontSize: 12.5, fontWeight: "700", lineHeight: 18 },
  button: { alignItems: "center", borderRadius: 999, justifyContent: "center", minHeight: 36, paddingHorizontal: 13 },
  buttonPressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  buttonText: { fontSize: 13, fontWeight: "900" },
  card: { borderRadius: 14, borderWidth: 1, gap: 12, marginTop: 10, overflow: "hidden", padding: 14 },
  copy: { flex: 1, minWidth: 0 },
  cursor: { borderRadius: 999, height: 11, width: 6 },
  dot: { borderRadius: 999, height: 6, width: 6 },
  header: { alignItems: "center", flexDirection: "row", gap: 10 },
  icon: { alignItems: "center", borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  kicker: { fontSize: 10.5, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" },
  line: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 12, fontWeight: "700" },
  status: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 11, fontWeight: "800" },
  statusRow: { alignItems: "center", flexDirection: "row", gap: 7, marginTop: 7 },
  sweep: { bottom: -18, position: "absolute", top: -18, width: 54 },
  terminal: { borderRadius: 12, borderWidth: 1, minHeight: 108, padding: 13 },
  terminalCard: { gap: 0, padding: 7 },
  terminalDots: { flexDirection: "row", gap: 5, marginBottom: 9 },
  title: { fontSize: 15.5, fontWeight: "900", marginTop: 2 },
});
