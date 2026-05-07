import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styles } from "../styles";

export function ProfileGeneratingScreen() {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0.08)).current;
  const statusOpacity = useRef(new Animated.Value(1)).current;
  const dotOne = useRef(new Animated.Value(0)).current;
  const dotTwo = useRef(new Animated.Value(0)).current;
  const dotThree = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<"analyzing" | "generating">("analyzing");

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
      ])
    );
    const rotateLoop = Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: true })
    );
    const dotLoop = Animated.loop(
      Animated.stagger(150, [dotOne, dotTwo, dotThree].map((dot) => (
        Animated.sequence([
          Animated.timing(dot, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 520, easing: Easing.in(Easing.cubic), useNativeDriver: true })
        ])
      )))
    );
    const progressAnimation = Animated.timing(progress, { toValue: 0.68, duration: 1850, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    const statusTimer = setTimeout(() => {
      Animated.timing(statusOpacity, { toValue: 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return;
        setPhase("generating");
        Animated.timing(statusOpacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      });
    }, 960);

    pulseLoop.start();
    rotateLoop.start();
    dotLoop.start();
    progressAnimation.start();

    return () => {
      clearTimeout(statusTimer);
      pulseLoop.stop();
      rotateLoop.stop();
      dotLoop.stop();
    };
  }, [dotOne, dotThree, dotTwo, progress, pulse, rotate, statusOpacity]);

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1.045] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.42, 0.74] });
  const rotateZ = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const progressDot = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const dots = [dotOne, dotTwo, dotThree];
  const title = phase === "analyzing" ? "Analyzing your answers..." : "Generating your builder profile...";
  const subtitle = phase === "analyzing"
    ? "Understanding your workflow and how you like to build."
    : "Tailoring the best coding experience for you.";

  return (
    <View style={[styles.generatingScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.generatingContent}>
        <View style={styles.generatingVisual}>
          <Animated.View style={[styles.generatingOuterGlow, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
          <View style={styles.generatingOrbitGhost} />
          <Animated.View style={[styles.generatingOrbitRing, { transform: [{ rotate: rotateZ }] }]}>
            <View style={[styles.generatingOrbitDot, styles.generatingOrbitDotMagenta]} />
            <View style={[styles.generatingOrbitDot, styles.generatingOrbitDotCyan]} />
            <View style={[styles.generatingOrbitDot, styles.generatingOrbitDotPurple]} />
          </Animated.View>
          <View style={styles.generatingInnerRing} />
          <LinearGradient
            colors={["rgba(214, 132, 255, 0.95)", "rgba(108, 37, 222, 0.96)", "rgba(35, 13, 86, 0.98)"]}
            start={{ x: 0.18, y: 0.12 }}
            end={{ x: 0.88, y: 0.9 }}
            style={styles.generatingCore}
          >
            <View style={styles.generatingCoreShade} />
            <View style={styles.generatingCoreGlass} />
            <View style={styles.generatingDots}>
              {dots.map((dot, index) => {
                const opacity = dot.interpolate({ inputRange: [0, 1], outputRange: [0.42, 1] });
                const translateY = dot.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });

                return (
                  <Animated.View key={index} style={[styles.generatingDot, { opacity, transform: [{ translateY }] }]} />
                );
              })}
            </View>
          </LinearGradient>
        </View>

        <Animated.View style={[styles.generatingStatusWrap, { opacity: statusOpacity }]}>
          <Text style={styles.generatingStatus}>{title}</Text>
          <Text style={styles.generatingSubtitle}>{subtitle}</Text>
        </Animated.View>

        <View style={styles.generatingTrack}>
          <Animated.View style={[styles.generatingTrackFill, { width: progressWidth }]}>
            <LinearGradient
              colors={["#5B22D6", "#9E36FF", "#D978FF"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.generatingTrackFillGradient}
            />
          </Animated.View>
          <Animated.View style={[styles.generatingTrackDotWrap, { left: progressDot }]}>
            <View style={styles.generatingTrackDot} />
          </Animated.View>
        </View>
      </View>
    </View>
  );
}
