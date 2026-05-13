import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { editPermissionStyles as styles } from "./EditPermissionCard.styles";
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

