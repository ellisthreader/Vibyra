import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { VibyraLogo } from "../components/VibyraLogo";
import { useAppContext } from "../context/AppContext";
import { colors } from "../styles/theme";

const { width, height } = Dimensions.get("window");

export function AuthScreen() {
  const app = useAppContext();
  const tagline = "Code from anywhere";
  const [shimmerActive, setShimmerActive] = useState(false);
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoTranslateY = useRef(new Animated.Value(-120)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const restOpacity = useRef(new Animated.Value(0)).current;
  const restTranslateY = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    const logoEntrance = Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 8,
        tension: 44,
        useNativeDriver: true
      }),
      Animated.timing(logoTranslateY, {
        toValue: 0,
        duration: 1100,
        easing: Easing.bezier(0.2, 0.92, 0.2, 1),
        useNativeDriver: true
      })
    ]);

    const titleEntrance = Animated.parallel([
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(titleTranslateY, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]);

    const restEntrance = Animated.parallel([
      Animated.timing(restOpacity, {
        toValue: 1,
        duration: 720,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(restTranslateY, {
        toValue: 0,
        duration: 760,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true
      })
    ]);

    logoEntrance.start(() => {
      titleEntrance.start(() => {
        setShimmerActive(true);
        restEntrance.start();
      });
    });
  }, [logoOpacity, logoScale, logoTranslateY, titleOpacity, titleTranslateY, restOpacity, restTranslateY]);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <LinearGradient colors={["#050509", "#07070A", "#0C0A11"]} style={styles.screen}>
        <AnimatedBackdrop />
        <View style={styles.content}>
          <View style={styles.hero}>
            <Animated.View
              style={[
                styles.logoStage,
                {
                  opacity: logoOpacity,
                  transform: [{ translateY: logoTranslateY }, { scale: logoScale }]
                }
              ]}
            >
              <VibyraLogo />
            </Animated.View>
            <Animated.View
              style={[
                styles.titleStage,
                {
                  opacity: titleOpacity,
                  transform: [{ translateY: titleTranslateY }]
                }
              ]}
            >
              <Text style={styles.title}>Welcome to Vibyra</Text>
            </Animated.View>
            <Animated.View
              style={[
                styles.taglineStage,
                {
                  opacity: restOpacity,
                  transform: [{ translateY: restTranslateY }]
                }
              ]}
            >
              <ShimmerLine text={tagline} active={shimmerActive} />
            </Animated.View>
          </View>

          <Animated.View
            style={[
              styles.actions,
              {
                opacity: restOpacity,
                transform: [{ translateY: restTranslateY }]
              }
            ]}
          >
            <Pressable style={({ pressed }) => [styles.primaryCta, pressed ? styles.primaryCtaPressed : null]} onPress={() => app.authenticateWith("email")}>
              <Text style={styles.primaryCtaText}>Get started</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.text} />
            </Pressable>
            <Pressable style={({ pressed }) => [styles.accountButton, pressed ? styles.accountButtonPressed : null]} onPress={() => app.authenticateWith("email")}>
              <Text style={styles.accountText}>I have an account</Text>
            </Pressable>
          </Animated.View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

function AnimatedBackdrop() {
  const drift = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 14000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 14000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        })
      ])
    );

    driftLoop.start();
    pulseLoop.start();

    return () => {
      driftLoop.stop();
      pulseLoop.stop();
    };
  }, [drift, pulse]);

  const leftBlob = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.42] }),
    transform: [
      { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-24, 28] }) },
      { translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [12, -18] }) },
      { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }
    ]
  };

  const rightBlob = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.3] }),
    transform: [
      { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [18, -36] }) },
      { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-22, 22] }) },
      { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1.04, 0.96] }) }
    ]
  };

  const centerGlow = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.32] }),
    transform: [
      { translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
      { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] }) }
    ]
  };

  return (
    <View pointerEvents="none" style={styles.backdrop}>
      <Animated.View style={[styles.blob, styles.leftBlob, leftBlob]}>
        <LinearGradient colors={["rgba(109, 59, 255, 0.78)", "rgba(242, 58, 205, 0.14)"]} style={styles.blobFill} />
      </Animated.View>
      <Animated.View style={[styles.blob, styles.rightBlob, rightBlob]}>
        <LinearGradient colors={["rgba(255, 179, 71, 0.55)", "rgba(242, 58, 205, 0.08)"]} style={styles.blobFill} />
      </Animated.View>
      <Animated.View style={[styles.centerGlow, centerGlow]}>
        <LinearGradient colors={["rgba(242, 58, 205, 0.18)", "rgba(109, 59, 255, 0.02)"]} style={styles.blobFill} />
      </Animated.View>
      <View style={styles.noiseVeil} />
    </View>
  );
}

function ShimmerLine({ text, active }: { text: string; active: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    if (!active) {
      return undefined;
    }

    const animation = Animated.timing(progress, {
      toValue: text.length + 4,
      duration: 2600,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [active, progress, text]);

  return (
    <View style={styles.shimmerRow}>
      {text.split("").map((char, index) => {
        const opacity = progress.interpolate({
          inputRange: [index - 1.1, index, index + 0.8, index + 1.8],
          outputRange: [0.45, 0.68, 1, 0.68],
          extrapolate: "clamp"
        });

        const color = progress.interpolate({
          inputRange: [index - 1.1, index + 0.6, index + 1.8],
          outputRange: ["rgb(122,122,140)", "rgb(255,255,255)", "rgb(184,184,200)"],
          extrapolate: "clamp"
        });

        return (
          <Animated.Text key={`${char}-${index}`} style={[styles.shimmerChar, { color, opacity }]}>
            {char === " " ? "\u00A0" : char}
          </Animated.Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  accountButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center"
  },
  accountButtonPressed: {
    opacity: 0.72
  },
  accountText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "700"
  },
  actions: {
    alignSelf: "stretch",
    gap: 10,
    paddingBottom: 4,
    width: "100%"
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden"
  },
  blob: {
    borderRadius: 999,
    position: "absolute"
  },
  blobFill: {
    borderRadius: 999,
    flex: 1
  },
  centerGlow: {
    borderRadius: 999,
    height: 300,
    left: width * 0.5 - 150,
    position: "absolute",
    top: height * 0.24,
    width: 300
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 28
  },
  hero: {
    alignItems: "center",
    flex: 1,
    gap: 0,
    justifyContent: "center",
    paddingBottom: 32
  },
  leftBlob: {
    height: 420,
    left: -110,
    top: height * 0.14,
    width: 420
  },
  noiseVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7, 7, 10, 0.16)"
  },
  logoStage: {
    alignItems: "center",
    justifyContent: "center"
  },
  primaryCta: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    height: 56,
    justifyContent: "center",
    paddingHorizontal: 18,
    width: "100%"
  },
  primaryCtaPressed: {
    backgroundColor: "rgba(23, 23, 34, 0.98)",
    borderColor: "rgba(139, 92, 255, 0.42)",
    transform: [{ scale: 0.99 }]
  },
  primaryCtaText: { color: colors.text, fontSize: 16, fontWeight: "800" },
  rightBlob: {
    height: 380,
    right: -90,
    top: height * 0.08,
    width: 380
  },
  screen: { backgroundColor: colors.background, flex: 1 },
  shimmerChar: {
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 24
  },
  shimmerRow: { alignItems: "center", flexDirection: "row", justifyContent: "center", marginTop: 8 },
  taglineStage: {
    alignItems: "center",
    marginTop: 8
  },
  title: { color: colors.text, fontSize: 31, fontWeight: "700", textAlign: "center" },
  titleStage: {
    marginTop: -2
  }
});
