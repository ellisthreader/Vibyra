import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { CodeChange } from "../../../types/domain";

export function EditPermissionCard({ changes, projectName, busy, onAllow, onAllowAlways, onDeny }: {
  changes: CodeChange[];
  projectName?: string;
  busy?: boolean;
  onAllow: () => void;
  onAllowAlways: () => void;
  onDeny: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(10)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(lift, { toValue: 0, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" })
    ]).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, lift, pulse]);

  const visible = changes.filter((c) => !c.file.includes(".vibyra-agent/runs/"));
  const totalAdd = visible.reduce((s, c) => s + c.additions, 0);
  const totalDel = visible.reduce((s, c) => s + c.deletions, 0);
  const previewFiles = visible.slice(0, 3);
  const remaining = Math.max(0, visible.length - previewFiles.length);
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });

  return (
    <Animated.View style={[styles.card, { opacity, transform: [{ translateY: lift }] }]}>
      <LinearGradient
        colors={["rgba(142, 60, 255, 0.18)", "rgba(78, 192, 122, 0.10)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      />
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Animated.View style={[styles.iconRing, { opacity: ringOpacity }]} />
          <LinearGradient
            colors={["#8E3CFF", "#5D24D8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCore}
          >
            <Ionicons name="shield-checkmark" color="#FFFFFF" size={18} />
          </LinearGradient>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>Permission required</Text>
          <Text style={styles.title}>
            Allow Vibyra to edit {visible.length} file{visible.length === 1 ? "" : "s"}
            {projectName ? ` in ${projectName}` : ""}?
          </Text>
        </View>
      </View>

      <View style={styles.fileList}>
        {previewFiles.map((change) => (
          <View key={change.id} style={styles.fileRow}>
            <Ionicons name="document-text-outline" color="#BFAEFF" size={13} />
            <Text numberOfLines={1} style={styles.filePath}>
              {(change.file.replace(/\\/g, "/").split("/").pop()) || change.file}
            </Text>
            <Text style={styles.fileAdd}>+{change.additions}</Text>
            <Text style={styles.fileDel}>-{change.deletions}</Text>
          </View>
        ))}
        {remaining > 0 ? (
          <Text style={styles.moreLabel}>+ {remaining} more file{remaining === 1 ? "" : "s"}</Text>
        ) : null}
      </View>

      <View style={styles.totalsRow}>
        <View style={styles.totalChip}>
          <Ionicons name="add-circle" color="#4EC07A" size={12} />
          <Text style={styles.totalAdd}>{totalAdd} added</Text>
        </View>
        <View style={styles.totalChip}>
          <Ionicons name="remove-circle" color="#F26A6A" size={12} />
          <Text style={styles.totalDel}>{totalDel} removed</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Deny edits"
          disabled={busy}
          onPress={onDeny}
          style={({ pressed }) => [styles.btn, styles.btnDeny, pressed && styles.btnPressed, busy && styles.btnDisabled]}
        >
          <Ionicons name="close" color="#FFB3B3" size={14} />
          <Text style={styles.btnDenyText}>No</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Allow these edits once"
          disabled={busy}
          onPress={onAllow}
          style={({ pressed }) => [styles.btn, styles.btnAllow, pressed && styles.btnPressed, busy && styles.btnDisabled]}
        >
          <Ionicons name="checkmark" color="#FFFFFF" size={14} />
          <Text style={styles.btnAllowText}>Allow</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Always allow edits in this project"
          disabled={busy}
          onPress={onAllowAlways}
          style={({ pressed }) => [styles.btn, styles.btnAlways, pressed && styles.btnPressed, busy && styles.btnDisabled]}
        >
          <LinearGradient
            colors={["#8E3CFF", "#4EC07A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons name="sparkles" color="#FFFFFF" size={14} />
          <Text style={styles.btnAllowText}>Allow always</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(15, 17, 26, 0.92)",
    borderColor: "rgba(176, 132, 255, 0.32)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginTop: 10,
    overflow: "hidden",
    padding: 14,
  },
  gradient: { ...StyleSheet.absoluteFillObject, opacity: 0.7 },
  headerRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  iconWrap: { alignItems: "center", height: 42, justifyContent: "center", width: 42 },
  iconRing: {
    backgroundColor: "rgba(142, 60, 255, 0.4)",
    borderRadius: 999,
    height: 42,
    position: "absolute",
    width: 42,
  },
  iconCore: {
    alignItems: "center",
    borderRadius: 12,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  headerText: { flex: 1, minWidth: 0 },
  kicker: { color: "#D7C4FF", fontSize: 10, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase" },
  title: { color: "#FFFFFF", fontSize: 14.5, fontWeight: "900", lineHeight: 19, marginTop: 3 },
  fileList: {
    backgroundColor: "rgba(7, 8, 15, 0.5)",
    borderColor: "rgba(176, 132, 255, 0.18)",
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    padding: 10,
  },
  fileRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  filePath: { color: "#E5E2F0", flex: 1, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 12, fontWeight: "700", minWidth: 0 },
  fileAdd: { color: "#4EC07A", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 11, fontWeight: "800" },
  fileDel: { color: "#F26A6A", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 11, fontWeight: "800" },
  moreLabel: { color: "#A29CB8", fontSize: 11, fontWeight: "700", paddingLeft: 21 },
  totalsRow: { flexDirection: "row", gap: 8 },
  totalChip: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  totalAdd: { color: "#4EC07A", fontSize: 11, fontWeight: "800" },
  totalDel: { color: "#F26A6A", fontSize: 11, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 8 },
  btn: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 38,
    overflow: "hidden",
    paddingHorizontal: 14,
  },
  btnDeny: {
    backgroundColor: "rgba(242, 106, 106, 0.10)",
    borderColor: "rgba(242, 106, 106, 0.35)",
    borderWidth: 1,
  },
  btnDenyText: { color: "#FFB3B3", fontSize: 13, fontWeight: "800" },
  btnAllow: {
    backgroundColor: "rgba(78, 192, 122, 0.18)",
    borderColor: "rgba(78, 192, 122, 0.45)",
    borderWidth: 1,
  },
  btnAlways: { flex: 1.1 },
  btnAllowText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  btnPressed: { transform: [{ scale: 0.97 }] },
  btnDisabled: { opacity: 0.5 },
});
