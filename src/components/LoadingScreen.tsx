import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleProp, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from "react-native";
import { darkColors } from "../styles/theme";
import { supportsNativeAnimation } from "../utils/nativeAnimation";
import { VibyraLogo } from "./VibyraLogo";

type LoadingColors = typeof darkColors;

type Props = {
  colors?: LoadingColors;
  compact?: boolean;
  message?: string;
  scheme?: "dark" | "light";
  simple?: boolean;
  style?: StyleProp<ViewStyle>;
  title?: string;
};

export function LoadingScreen({
  colors = darkColors,
  compact = false,
  message = "Getting everything ready.",
  scheme = "dark",
  simple = false,
  style,
  title = "Loading Vibyra"
}: Props) {
  const { width } = useWindowDimensions();
  const breathe = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.cubic), useNativeDriver: supportsNativeAnimation }),
        Animated.timing(breathe, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.cubic), useNativeDriver: supportsNativeAnimation })
      ])
    );
    const orbitLoop = Animated.loop(
      Animated.timing(orbit, { toValue: 1, duration: 7200, easing: Easing.linear, useNativeDriver: supportsNativeAnimation })
    );
    const sweepLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1350, easing: Easing.inOut(Easing.cubic), useNativeDriver: supportsNativeAnimation }),
        Animated.timing(sweep, { toValue: 0, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: supportsNativeAnimation })
      ])
    );

    breatheLoop.start();
    orbitLoop.start();
    sweepLoop.start();

    return () => {
      breatheLoop.stop();
      orbitLoop.stop();
      sweepLoop.stop();
    };
  }, [breathe, orbit, sweep]);

  const isLight = scheme === "light";
  const plateSize = compact ? 112 : Math.min(148, Math.max(124, width * 0.34));
  const logoWidth = compact ? 76 : 98;
  const logoHeight = logoWidth / (515 / 375);
  const logoPlateSize = simple ? "68%" : "72%";
  const haloOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [isLight ? 0.22 : 0.28, isLight ? 0.46 : 0.6] });
  const logoScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1.035] });
  const ringRotate = orbit.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const sweepTranslate = sweep.interpolate({ inputRange: [0, 1], outputRange: [-42, 172] });
  const background = isLight
    ? ["#F8F7FE", "#FFFFFF", "#F1F3F9"] as const
    : ["#07070A", "#0D0B14", "#08080D"] as const;
  const titleColor = colors.text;
  const messageColor = colors.muted;

  return (
    <LinearGradient
      accessibilityLabel={`${title}. ${message}`}
      colors={background}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.screen, compact ? styles.compactScreen : null, style]}
    >
      <View style={[styles.topLine, { backgroundColor: isLight ? "rgba(109, 59, 255, 0.08)" : "rgba(255, 255, 255, 0.05)" }]} />
      <View style={styles.content}>
        <Animated.View style={[styles.logoStage, { height: plateSize, width: plateSize, transform: [{ scale: logoScale }] }]}>
          {simple ? null : <Animated.View style={[styles.halo, { borderColor: colors.borderStrong, opacity: haloOpacity }]} />}
          {simple ? null : (
            <Animated.View style={[styles.ring, { borderColor: isLight ? "rgba(109, 59, 255, 0.28)" : "rgba(255, 255, 255, 0.22)", transform: [{ rotate: ringRotate }] }]}>
              <View style={[styles.ringTick, { backgroundColor: colors.magenta }]} />
              <View style={[styles.ringTickAlt, { backgroundColor: colors.info }]} />
            </Animated.View>
          )}
          <LinearGradient
            colors={isLight ? ["rgba(255,255,255,0.96)", "rgba(247,243,255,0.9)"] : ["rgba(26, 21, 40, 0.96)", "rgba(12, 10, 18, 0.98)"]}
            style={[styles.logoPlate, { borderColor: isLight ? "rgba(109, 59, 255, 0.18)" : "rgba(255, 255, 255, 0.1)", borderRadius: simple ? 999 : 30, height: logoPlateSize, width: logoPlateSize }]}
          >
            <VibyraLogo style={{ height: logoHeight, width: logoWidth }} />
          </LinearGradient>
        </Animated.View>

        <View style={styles.copy}>
          <Text style={[styles.title, compact ? styles.compactTitle : null, { color: titleColor }]}>{title}</Text>
          <Text style={[styles.message, compact ? styles.compactMessage : null, { color: messageColor }]}>{message}</Text>
        </View>

        <View style={[styles.track, { backgroundColor: isLight ? "rgba(109, 59, 255, 0.09)" : "rgba(255, 255, 255, 0.08)" }]}>
          <Animated.View style={[styles.sweep, { backgroundColor: colors.accent, transform: [{ translateX: sweepTranslate }] }]} />
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  compactMessage: { fontSize: 12, lineHeight: 17 },
  compactScreen: { minHeight: 260, paddingHorizontal: 18 },
  compactTitle: { fontSize: 16 },
  content: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 26
  },
  copy: { alignItems: "center", gap: 7, marginTop: 22 },
  halo: {
    borderRadius: 999,
    borderWidth: 1,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  logoPlate: { alignItems: "center", borderWidth: 1, justifyContent: "center", overflow: "hidden" },
  logoStage: { alignItems: "center", justifyContent: "center" },
  message: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    maxWidth: 280,
    textAlign: "center"
  },
  ring: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    height: "88%",
    justifyContent: "center",
    position: "absolute",
    width: "88%"
  },
  ringTick: {
    borderRadius: 999,
    height: 6,
    position: "absolute",
    right: 11,
    top: 21,
    width: 6
  },
  ringTickAlt: {
    borderRadius: 999,
    bottom: 16,
    height: 5,
    left: 24,
    position: "absolute",
    width: 5
  },
  screen: { flex: 1, overflow: "hidden" },
  sweep: { borderRadius: 999, height: "100%", opacity: 0.92, width: 54 },
  title: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center"
  },
  topLine: { height: 1, left: 0, position: "absolute", right: 0, top: 0 },
  track: {
    borderRadius: 999,
    height: 4,
    marginTop: 28,
    overflow: "hidden",
    width: 184
  }
});
