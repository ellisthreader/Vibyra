import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, ImageSourcePropType, View } from "react-native";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";
import { frequencyBackdrop, resultBackdrop } from "../data/options";
import { OnboardingBackdropVariant } from "../types";
import { styles } from "../styles";

export function PersistentOnboardingBackground({ variant }: { variant: OnboardingBackdropVariant }) {
  const defaultOpacity = useRef(new Animated.Value(variant === "default" ? 1 : 0)).current;
  const quizOpacity = useRef(new Animated.Value(variant === "quiz" ? 1 : 0)).current;
  const resultOpacity = useRef(new Animated.Value(variant === "result" ? 1 : 0)).current;

  useEffect(() => {
    const duration = 240;

    Animated.parallel([
      Animated.timing(defaultOpacity, { toValue: variant === "default" ? 1 : 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: supportsNativeAnimation }),
      Animated.timing(quizOpacity, { toValue: variant === "quiz" ? 1 : 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: supportsNativeAnimation }),
      Animated.timing(resultOpacity, { toValue: variant === "result" ? 1 : 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: supportsNativeAnimation })
    ]).start();
  }, [defaultOpacity, quizOpacity, resultOpacity, variant]);

  return (
    <View style={[styles.persistentBackdrop, { pointerEvents: "none" }]}>
      <Animated.View style={[styles.backdropLayer, { opacity: defaultOpacity }]}>
        <OnboardingBackdrop />
      </Animated.View>
      <Animated.View style={[styles.backdropLayer, { opacity: quizOpacity }]}>
        <QuizBackdrop source={frequencyBackdrop} />
      </Animated.View>
      <Animated.View style={[styles.backdropLayer, { opacity: resultOpacity }]}>
        <QuizBackdrop source={resultBackdrop} />
      </Animated.View>
    </View>
  );
}

function QuizBackdrop({ source }: { source: ImageSourcePropType }) {
  return (
    <View style={styles.quizBackdrop}>
      <Image fadeDuration={0} source={source} resizeMode="stretch" style={styles.frequencyBackdropImage} />
      <LinearGradient
        colors={["rgba(4, 7, 13, 0.34)", "rgba(4, 7, 13, 0.58)", "rgba(4, 7, 13, 0.36)"]}
        locations={[0, 0.52, 1]}
        style={[styles.quizBackdropShade, { pointerEvents: "none" }]}
      />
      <LinearGradient
        colors={["rgba(0, 0, 0, 0.42)", "rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.52)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.quizBackdropVignette, { pointerEvents: "none" }]}
      />
    </View>
  );
}

function OnboardingBackdrop() {
  return (
    <View style={[styles.backdrop, { pointerEvents: "none" }]}>
      <LinearGradient
        colors={["rgba(109, 59, 255, 0.22)", "rgba(242, 58, 205, 0.08)", "rgba(255, 179, 71, 0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.backdropBand, styles.backdropBandTop]}
      />
      <LinearGradient
        colors={["rgba(255, 179, 71, 0.14)", "rgba(242, 58, 205, 0.08)", "rgba(109, 59, 255, 0)"]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.backdropBand, styles.backdropBandBottom]}
      />
      <View style={styles.backdropGrid} />
    </View>
  );
}
