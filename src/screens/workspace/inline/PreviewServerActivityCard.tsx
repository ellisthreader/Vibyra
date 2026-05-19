import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
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
  const running = previewServer.status === "starting";
  const [typedLength, setTypedLength] = useState(0);
  const terminalLines = linesForPreviewServer(previewServer);
  const terminalMode = previewServer.status !== "approval";
  const activeLine = terminalLines[terminalLines.length - 1] ?? "";

  useEffect(() => {
    if (!running) return;
    const blinkLoop = Animated.loop(Animated.sequence([
      Animated.timing(blink, { duration: 520, toValue: 1, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(blink, { duration: 520, toValue: 0, useNativeDriver: Platform.OS !== "web" })
    ]));
    blinkLoop.start();
    return () => {
      blinkLoop.stop();
    };
  }, [blink, running]);

  useEffect(() => {
    if (!terminalMode) return;
    if (!running) {
      setTypedLength(activeLine.length);
      return;
    }
    setTypedLength(0);
    const timer = setInterval(() => {
      setTypedLength((current) => {
        if (current >= activeLine.length) {
          clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 18);
    return () => clearInterval(timer);
  }, [activeLine, running, terminalMode]);

  return (
    <View style={[
      styles.card,
      terminalMode ? styles.terminalCard : null,
      {
        backgroundColor: terminalMode ? palette.panelBg : palette.cardBg,
        borderColor: terminalMode ? palette.panelBorder : palette.cardBorder
      }
    ]}>
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
      {terminalMode ? (
        <View style={[styles.terminal, styles.terminalFull, { backgroundColor: palette.panelBg, borderColor: palette.panelBorder }]}>
          <View style={styles.terminalDots}>
            <View style={[styles.dot, { backgroundColor: "#FF6B7A" }]} />
            <View style={[styles.dot, { backgroundColor: "#FFD166" }]} />
            <View style={[styles.dot, { backgroundColor: "#7CF1B3" }]} />
          </View>
          {terminalLines.map((line, index) => {
            const current = index === terminalLines.length - 1;
            const text = current && running ? line.slice(0, typedLength) : line;
            return (
              <Text key={`${index}-${line}`} style={[styles.line, lineTone(line, palette, current)]}>
                {text}
                {current && running ? <Animated.Text style={{ opacity: blink }}>_</Animated.Text> : null}
              </Text>
            );
          })}
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
  const lines = ["$ vibyra preview:start --phone", "desktop: request received"];
  if (phaseAtLeast(previewServer.phase, "starting-server")) lines.push("desktop: selecting preview route");
  if (phaseAtLeast(previewServer.phase, "verifying-phone")) lines.push("phone: verifying route and assets");
  if (previewServer.status === "ready") lines.push("success: preview route ready");
  if (previewServer.status === "failed") lines.push(`error: ${previewServer.detail ?? "preview server did not start"}`);
  if (previewServer.status === "cancelled") lines.push("cancelled: preview start stopped");
  return lines;
}

function phaseAtLeast(current: PreviewServerPrompt["phase"], phase: PreviewServerPrompt["phase"]) {
  const order: PreviewServerPrompt["phase"][] = ["requesting-desktop", "starting-server", "verifying-phone", "ready"];
  return order.indexOf(current) >= order.indexOf(phase);
}

function lineTone(line: string, palette: ReturnType<typeof useChatActionCardPalette>, active: boolean) {
  if (line.startsWith("$")) return { color: palette.kicker };
  if (line.startsWith("success:")) return { color: "#7CF1B3" };
  if (line.startsWith("error:")) return { color: "#FF8AA1" };
  if (line.startsWith("cancelled:")) return { color: "#FFD166" };
  return { color: active ? palette.text : palette.body };
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
  line: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 12, fontWeight: "700", lineHeight: 18 },
  terminal: { alignSelf: "stretch", borderRadius: 14, borderWidth: 1, minHeight: 136, padding: 14 },
  terminalCard: { gap: 0, padding: 0 },
  terminalDots: { flexDirection: "row", gap: 5, marginBottom: 9 },
  terminalFull: { borderWidth: 0 },
  title: { fontSize: 15.5, fontWeight: "900", marginTop: 2 },
});
