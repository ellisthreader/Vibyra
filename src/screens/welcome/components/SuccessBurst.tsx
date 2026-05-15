import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { styles } from "../styles";

const SPARKLE_COUNT = 12;

export function SuccessBurst() {
  const reduced = useReduceMotion();
  const check = useRef(new Animated.Value(reduced ? 1 : 0.4)).current;
  const seeds = useMemo(() => buildSeeds(), []);

  useEffect(() => {
    if (reduced) {
      check.setValue(1);
      return;
    }
    Animated.spring(check, { toValue: 1, useNativeDriver: supportsNativeAnimation, speed: 9, bounciness: 14 }).start();
  }, [check, reduced]);

  return (
    <View accessible={false} style={styles.burstWrap}>
      {seeds.map((seed, index) => <Sparkle key={index} seed={seed} reduced={reduced} />)}
      <Animated.View style={[styles.checkRing, { transform: [{ scale: check }] }]}>
        <Ionicons color="#37D67A" name="checkmark" size={68} />
      </Animated.View>
    </View>
  );
}

function Sparkle({ seed, reduced }: { seed: SparkleSeed; reduced: boolean }) {
  const driver = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      driver.setValue(0);
      return;
    }
    Animated.timing(driver, {
      toValue: 1,
      delay: seed.delay,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: supportsNativeAnimation
    }).start();
  }, [driver, reduced, seed.delay]);

  const translateX = driver.interpolate({ inputRange: [0, 1], outputRange: [0, seed.x] });
  const translateY = driver.interpolate({ inputRange: [0, 1], outputRange: [0, seed.y] });
  const opacity = driver.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] });
  const scale = driver.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.4, 1.1, 0.6] });

  return <Animated.View style={[styles.sparkle, { opacity, transform: [{ translateX }, { translateY }, { scale }] }]} />;
}

type SparkleSeed = { x: number; y: number; delay: number };

function buildSeeds(): SparkleSeed[] {
  return Array.from({ length: SPARKLE_COUNT }, (_, i) => {
    const angle = (i / SPARKLE_COUNT) * Math.PI * 2;
    const radius = 80 + ((i * 11) % 30);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      delay: 60 + (i * 35)
    };
  });
}
