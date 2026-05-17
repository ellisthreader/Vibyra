import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";
import { useReduceMotion } from "./useReduceMotion";

const APPLE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

const TIMINGS = {
  eyebrow: { delay: 200, duration: 700 },
  ring: { delay: 350, duration: 1100 },
  helper: { delay: 1300, duration: 800 }
};

export function useSetupIntro() {
  const reduced = useReduceMotion();
  const eyebrow = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const helper = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      eyebrow.setValue(1); ring.setValue(1); helper.setValue(1);
      return;
    }
    [eyebrow, ring, helper].forEach((v) => v.setValue(0));
    const stage = (value: Animated.Value, key: keyof typeof TIMINGS) =>
      Animated.timing(value, {
        delay: TIMINGS[key].delay,
        duration: TIMINGS[key].duration,
        easing: APPLE_OUT,
        toValue: 1,
        useNativeDriver: supportsNativeAnimation
      });
    Animated.parallel([stage(eyebrow, "eyebrow"), stage(ring, "ring"), stage(helper, "helper")]).start();
  }, [eyebrow, helper, reduced, ring]);

  return {
    eyebrow: { opacity: eyebrow },
    ring: {
      opacity: ring,
      scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] })
    },
    helper: {
      opacity: helper,
      translateY: helper.interpolate({ inputRange: [0, 1], outputRange: [12, 0] })
    }
  };
}
