import React, { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { styles } from "../styles";

export function AnimatedStep({ children, fullBleed = false, transitionKey }: { children: React.ReactNode; fullBleed?: boolean; transitionKey: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    const startOpacity = hasAnimatedRef.current ? 0.94 : 1;
    const startOffset = hasAnimatedRef.current ? (fullBleed ? 6 : 10) : 0;

    opacity.stopAnimation();
    translateY.stopAnimation();
    opacity.setValue(startOpacity);
    translateY.setValue(startOffset);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: hasAnimatedRef.current ? 220 : 0,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: hasAnimatedRef.current ? 260 : 0,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]).start();
    hasAnimatedRef.current = true;
  }, [opacity, transitionKey, translateY]);

  return (
    <Animated.View style={[styles.stepBody, fullBleed ? styles.stepBodyFullBleed : null, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
