import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";
import { useReduceMotion } from "./useReduceMotion";

const APPLE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

const TIMINGS = {
  welcome: { delay: 350, duration: 1400 },
  tagline: { delay: 1500, duration: 1100 },
  cta: { delay: 2700, duration: 800 }
};

export function useHeroIntro() {
  const reduced = useReduceMotion();
  const welcome = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const cta = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      welcome.setValue(1); tagline.setValue(1); cta.setValue(1);
      return;
    }
    [welcome, tagline, cta].forEach((value) => value.setValue(0));
    const stage = (value: Animated.Value, key: keyof typeof TIMINGS) =>
      Animated.timing(value, {
        delay: TIMINGS[key].delay,
        duration: TIMINGS[key].duration,
        easing: APPLE_OUT,
        toValue: 1,
        useNativeDriver: supportsNativeAnimation
      });
    Animated.parallel([stage(welcome, "welcome"), stage(tagline, "tagline"), stage(cta, "cta")]).start();
  }, [cta, reduced, tagline, welcome]);

  return {
    welcome: {
      opacity: welcome,
      translateY: welcome.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
      scale: welcome.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] })
    },
    tagline: {
      opacity: tagline,
      translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [14, 0] })
    },
    cta: {
      opacity: cta,
      translateY: cta.interpolate({ inputRange: [0, 1], outputRange: [16, 0] })
    }
  };
}
