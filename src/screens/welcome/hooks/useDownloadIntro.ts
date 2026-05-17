import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";
import { useReduceMotion } from "./useReduceMotion";

const APPLE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

const TIMINGS = {
  eyebrow: { delay: 200, duration: 700 },
  title: { delay: 350, duration: 1100 },
  icon: { delay: 900, duration: 900 },
  url: { delay: 1400, duration: 900 },
  cta: { delay: 2000, duration: 800 }
};

export function useDownloadIntro() {
  const reduced = useReduceMotion();
  const eyebrow = useRef(new Animated.Value(0)).current;
  const title = useRef(new Animated.Value(0)).current;
  const icon = useRef(new Animated.Value(0)).current;
  const url = useRef(new Animated.Value(0)).current;
  const cta = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      eyebrow.setValue(1); title.setValue(1); icon.setValue(1);
      url.setValue(1); cta.setValue(1);
      return;
    }
    [eyebrow, title, icon, url, cta].forEach((v) => v.setValue(0));
    const stage = (value: Animated.Value, key: keyof typeof TIMINGS) =>
      Animated.timing(value, {
        delay: TIMINGS[key].delay,
        duration: TIMINGS[key].duration,
        easing: APPLE_OUT,
        toValue: 1,
        useNativeDriver: supportsNativeAnimation
      });
    Animated.parallel([
      stage(eyebrow, "eyebrow"),
      stage(title, "title"),
      stage(icon, "icon"),
      stage(url, "url"),
      stage(cta, "cta")
    ]).start();
  }, [cta, eyebrow, icon, reduced, title, url]);

  return {
    eyebrow: { opacity: eyebrow },
    title: {
      opacity: title,
      translateY: title.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
      scale: title.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] })
    },
    icon: {
      opacity: icon,
      scale: icon.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] })
    },
    url: {
      opacity: url,
      translateY: url.interpolate({ inputRange: [0, 1], outputRange: [12, 0] })
    },
    cta: {
      opacity: cta,
      translateY: cta.interpolate({ inputRange: [0, 1], outputRange: [16, 0] })
    }
  };
}
