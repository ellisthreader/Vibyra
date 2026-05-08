import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, View } from "react-native";
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
      Animated.timing(defaultOpacity, { toValue: variant === "default" ? 1 : 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(quizOpacity, { toValue: variant === "quiz" ? 1 : 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(resultOpacity, { toValue: variant === "result" ? 1 : 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    ]).start();
  }, [defaultOpacity, quizOpacity, resultOpacity, variant]);

  return (
    <View style={[styles.persistentBackdrop, { pointerEvents: "none" }]}>
      <Animated.View style={[styles.backdropLayer, { opacity: defaultOpacity }]}>
        <OnboardingBackdrop />
      </Animated.View>
      <Animated.View style={[styles.backdropLayer, { opacity: quizOpacity }]}>
        <Image fadeDuration={0} source={frequencyBackdrop} resizeMode="stretch" style={styles.frequencyBackdropImage} />
      </Animated.View>
      <Animated.View style={[styles.backdropLayer, { opacity: resultOpacity }]}>
        <Image fadeDuration={0} source={resultBackdrop} resizeMode="stretch" style={styles.resultBackdropImage} />
      </Animated.View>
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
