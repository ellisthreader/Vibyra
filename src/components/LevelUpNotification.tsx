import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreferences } from "../context/PreferencesContext";
import { LevelProgress } from "../utils/appApi";
import { levelUpNotificationPalettes } from "./LevelUpNotificationTheme";

type Props = {
  enabled: boolean;
  levelProgress?: LevelProgress;
};

type Notice = {
  id: number;
  level: number;
  rewardCredits: number;
  xpTotal: number;
};

const SPARKS = [
  { left: "12%", top: 14, x: -18, y: -26, size: 5 },
  { left: "24%", top: 54, x: -10, y: 28, size: 4 },
  { left: "48%", top: 8, x: 16, y: -24, size: 3 },
  { left: "68%", top: 62, x: 22, y: 22, size: 5 },
  { left: "82%", top: 18, x: 28, y: -18, size: 4 },
  { left: "92%", top: 48, x: 12, y: 24, size: 3 }
] as const;

const supportsNativeAnimation = Platform.OS !== "web";

export function LevelUpNotification({ enabled, levelProgress }: Props) {
  const insets = useSafeAreaInsets();
  const prefs = usePreferences();
  const palette = useMemo(() => levelUpNotificationPalettes[prefs.effectiveScheme], [prefs.effectiveScheme]);
  const previousLevel = useRef<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-34)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const spark = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const nextLevel = levelProgress?.level;
    if (!enabled || !nextLevel) {
      previousLevel.current = nextLevel ?? null;
      return;
    }
    const oldLevel = previousLevel.current;
    previousLevel.current = nextLevel;
    if (oldLevel === null || nextLevel <= oldLevel) return;
    setNotice({
      id: Date.now(),
      level: nextLevel,
      rewardCredits: rewardCreditsForLevel(levelProgress, nextLevel),
      xpTotal: levelProgress.xpTotal
    });
  }, [enabled, levelProgress]);

  useEffect(() => {
    if (!notice) return undefined;
    opacity.setValue(0);
    translateY.setValue(-34);
    scale.setValue(0.96);
    pulse.setValue(0);
    spark.setValue(0);
    shimmer.setValue(0);

    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: supportsNativeAnimation }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.cubic), useNativeDriver: supportsNativeAnimation })
      ])
    );
    const sparkLoop = Animated.loop(
      Animated.timing(spark, { toValue: 1, duration: 1550, easing: Easing.out(Easing.quad), useNativeDriver: supportsNativeAnimation })
    );
    const shimmerLoop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.cubic), useNativeDriver: supportsNativeAnimation })
    );
    pulseLoop.start();
    sparkLoop.start();
    shimmerLoop.start();

    const entrance = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: supportsNativeAnimation }),
        Animated.spring(translateY, { toValue: 0, damping: 15, mass: 0.72, stiffness: 170, useNativeDriver: supportsNativeAnimation }),
        Animated.spring(scale, { toValue: 1, damping: 13, mass: 0.7, stiffness: 180, useNativeDriver: supportsNativeAnimation })
      ]),
      Animated.delay(3400),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: supportsNativeAnimation }),
        Animated.timing(translateY, { toValue: -24, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: supportsNativeAnimation }),
        Animated.timing(scale, { toValue: 0.98, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: supportsNativeAnimation })
      ])
    ]);
    entrance.start(({ finished }) => {
      if (finished) setNotice((current) => (current?.id === notice.id ? null : current));
    });

    return () => {
      entrance.stop();
      pulseLoop.stop();
      sparkLoop.stop();
      shimmerLoop.stop();
    };
  }, [notice, opacity, pulse, scale, shimmer, spark, translateY]);

  if (!notice) return null;

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.24] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.42, 0.22, 0] });
  const shimmerX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-260, 340] });

  const topOffset = Math.max(insets.top + 18, 34);
  const xpBody = `${prefs.formatNumber(notice.xpTotal)} XP earned. Keep building.`;

  return (
    <Animated.View pointerEvents="none" style={[styles.host, { paddingTop: topOffset, opacity, transform: [{ translateY }, { scale }] }]}>
      <LinearGradient colors={palette.cardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { borderColor: palette.cardBorder, shadowColor: palette.shadow }]}>
        <Animated.View style={[styles.shimmer, { backgroundColor: palette.shimmer, transform: [{ translateX: shimmerX }, { rotate: "18deg" }] }]} />
        {SPARKS.map((item, index) => (
          <Animated.View
            key={`${item.left}-${item.top}`}
            style={[
              styles.spark,
              {
                backgroundColor: palette.spark,
                left: item.left,
                top: item.top,
                width: item.size,
                height: item.size,
                opacity: spark.interpolate({ inputRange: [0, 0.18, 0.75, 1], outputRange: [0, 1, 0.7, 0] }),
                transform: [
                  { translateX: spark.interpolate({ inputRange: [0, 1], outputRange: [0, item.x] }) },
                  { translateY: spark.interpolate({ inputRange: [0, 1], outputRange: [0, item.y] }) },
                  { scale: spark.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.5, 1.45 + index * 0.04, 0.8] }) }
                ]
              }
            ]}
          />
        ))}
        <View style={styles.iconWrap}>
          <Animated.View style={[styles.iconPulse, { backgroundColor: palette.iconPulse, opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />
          <LinearGradient colors={palette.iconGradient} style={styles.iconGradient}>
            <Ionicons name="sparkles" size={24} color={palette.icon} />
          </LinearGradient>
        </View>
        <View style={styles.copy}>
          <Text style={[styles.kicker, { color: palette.kicker }]}>LEVEL UP</Text>
          <Text style={[styles.title, { color: palette.title }]} numberOfLines={1}>Level {notice.level} unlocked</Text>
          {notice.rewardCredits > 0 ? (
            <View style={styles.rewardRow}>
              <Text style={[styles.body, { color: palette.body }]} numberOfLines={1}>{prefs.formatNumber(notice.rewardCredits)}</Text>
              <Ionicons name="flash" color={palette.flash} size={14} />
              <Text style={[styles.body, { color: palette.body }]} numberOfLines={1}>reward earned.</Text>
            </View>
          ) : (
            <Text style={[styles.body, { color: palette.body }]} numberOfLines={1}>{xpBody}</Text>
          )}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function rewardCreditsForLevel(levelProgress: LevelProgress, level: number) {
  return levelProgress.map?.find((node) => node.level === level)?.rewardCredits ?? 0;
}

const styles = StyleSheet.create({
  host: { position: "absolute", top: 0, left: 14, right: 14, zIndex: 1000, elevation: 1000 },
  card: {
    minHeight: 88, borderRadius: 8, borderWidth: 1,
    overflow: "hidden", padding: 14, flexDirection: "row", alignItems: "center", gap: 13,
    shadowOpacity: 0.34, shadowRadius: 22, shadowOffset: { width: 0, height: 14 }
  },
  shimmer: { position: "absolute", top: -36, bottom: -36, width: 78 },
  spark: { position: "absolute", borderRadius: 99 },
  iconWrap: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  iconPulse: { position: "absolute", width: 52, height: 52, borderRadius: 26 },
  iconGradient: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 0 },
  title: { fontSize: 19, fontWeight: "800", marginTop: 2 },
  body: { fontSize: 13, fontWeight: "600", marginTop: 3 },
  rewardRow: { alignItems: "center", flexDirection: "row", gap: 4, minWidth: 0 }
});
