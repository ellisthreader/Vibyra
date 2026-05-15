import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";

export function useRadarPulse(active: boolean, ringCount = 3, duration = 2200) {
  const driver = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      driver.stopAnimation();
      driver.setValue(0);
      return;
    }

    const loop = Animated.loop(Animated.timing(driver, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: supportsNativeAnimation
    }));

    loop.start();
    return () => loop.stop();
  }, [active, duration, driver]);

  const rings = Array.from({ length: ringCount }, (_, index) => {
    const offset = index / ringCount;
    const phased = driver.interpolate({
      inputRange: [0, 1],
      outputRange: [offset, offset + 1]
    });
    const wrapped = phased.interpolate({
      inputRange: [0, 1, 1.0001, 2],
      outputRange: [0, 1, 0, 1],
      extrapolate: "clamp"
    });
    return {
      scale: wrapped.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.85] }),
      opacity: wrapped.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.65, 0] })
    };
  });

  return rings;
}
