import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { editPermissionStyles as styles } from "./EditPermissionCard.styles";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { CodeChange } from "../../../types/domain";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";

export function EditPermissionCard({ changes, projectName, busy, onAllow, onAllowAlways, onDeny }: {
  changes: CodeChange[];
  projectName?: string;
  busy?: boolean;
  onAllow: () => void;
  onAllowAlways: () => void;
  onDeny: () => void;
}) {
  const prefs = usePreferences();
  const fileIconColor = useThemedColor("#BFAEFF");
  const addColor = useThemedColor("#4EC07A");
  const delColor = useThemedColor("#F26A6A");
  const denyColor = useThemedColor("#FFB3B3");
  const light = prefs.effectiveScheme === "light";
  const cardStyle = light ? { backgroundColor: prefs.colors.surface, borderColor: prefs.colors.border } : null;
  const bgGradient = light ? ["rgba(109, 59, 255, 0.08)", "rgba(18, 128, 92, 0.06)"] as const : ["rgba(142, 60, 255, 0.18)", "rgba(78, 192, 122, 0.10)"] as const;
  const iconGradient = light ? ["#7C3AED", "#6D3BFF"] as const : ["#8E3CFF", "#5D24D8"] as const;
  const fileListStyle = light ? { backgroundColor: prefs.colors.elevated, borderColor: prefs.colors.border } : null;
  const titleStyle = light ? { color: prefs.colors.text } : null;
  const kickerStyle = light ? { color: prefs.colors.accent } : null;
  const filePathStyle = light ? { color: prefs.colors.text } : null;
  const moreLabelStyle = light ? { color: prefs.colors.muted } : null;
  const totalChipStyle = light ? { backgroundColor: prefs.colors.elevated } : null;
  const denyStyle = light ? { backgroundColor: prefs.colors.errorSoft, borderColor: "rgba(217, 45, 80, 0.24)" } : null;
  const allowStyle = light ? { backgroundColor: prefs.colors.successSoft, borderColor: "rgba(18, 128, 92, 0.24)" } : null;
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
    <Animated.View style={[styles.card, cardStyle, { opacity, transform: [{ translateY: lift }] }]}>
      <LinearGradient
        colors={bgGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      />
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Animated.View style={[styles.iconRing, { opacity: ringOpacity }]} />
          <LinearGradient
            colors={iconGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCore}
          >
            <Ionicons name="shield-checkmark" color="#FFFFFF" size={18} />
          </LinearGradient>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.kicker, kickerStyle]}>Permission required</Text>
          <Text style={[styles.title, titleStyle]}>
            Allow Vibyra to edit {visible.length} file{visible.length === 1 ? "" : "s"}
            {projectName ? ` in ${projectName}` : ""}?
          </Text>
        </View>
      </View>

      <View style={[styles.fileList, fileListStyle]}>
        {previewFiles.map((change) => (
          <View key={change.id} style={styles.fileRow}>
            <Ionicons name="document-text-outline" color={fileIconColor} size={13} />
            <Text numberOfLines={1} style={[styles.filePath, filePathStyle]}>
              {(change.file.replace(/\\/g, "/").split("/").pop()) || change.file}
            </Text>
            <Text style={[styles.fileAdd, { color: addColor }]}>+{change.additions}</Text>
            <Text style={[styles.fileDel, { color: delColor }]}>-{change.deletions}</Text>
          </View>
        ))}
        {remaining > 0 ? (
          <Text style={[styles.moreLabel, moreLabelStyle]}>+ {remaining} more file{remaining === 1 ? "" : "s"}</Text>
        ) : null}
      </View>

      <View style={styles.totalsRow}>
        <View style={[styles.totalChip, totalChipStyle]}>
          <Ionicons name="add-circle" color={addColor} size={12} />
          <Text style={[styles.totalAdd, { color: addColor }]}>{totalAdd} added</Text>
        </View>
        <View style={[styles.totalChip, totalChipStyle]}>
          <Ionicons name="remove-circle" color={delColor} size={12} />
          <Text style={[styles.totalDel, { color: delColor }]}>{totalDel} removed</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Deny edits"
          disabled={busy}
          onPress={onDeny}
          style={({ pressed }) => [styles.btn, styles.btnDeny, denyStyle, pressed && styles.btnPressed, busy && styles.btnDisabled]}
        >
          <Ionicons name="close" color={denyColor} size={14} />
          <Text style={[styles.btnDenyText, { color: denyColor }]}>No</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Allow these edits once"
          disabled={busy}
          onPress={onAllow}
          style={({ pressed }) => [styles.btn, styles.btnAllow, allowStyle, pressed && styles.btnPressed, busy && styles.btnDisabled]}
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
