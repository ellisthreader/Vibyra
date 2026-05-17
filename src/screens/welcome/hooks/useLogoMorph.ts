import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";
import { useReduceMotion } from "./useReduceMotion";

const APPLE_INOUT = Easing.bezier(0.65, 0, 0.35, 1);

export function useLogoMorph() {
  const reduced = useReduceMotion();
  const driver = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      driver.setValue(1);
      return;
    }
    driver.setValue(0);
    const anim = Animated.sequence([
      Animated.delay(1350),
      Animated.timing(driver, { toValue: 1, duration: 1100, easing: APPLE_INOUT, useNativeDriver: supportsNativeAnimation })
    ]);
    anim.start();
    return () => anim.stop();
  }, [driver, reduced]);

  return {
    logoOpacity: driver.interpolate({ inputRange: [0, 0.45, 0.55, 1], outputRange: [1, 0.05, 0, 0] }),
    desktopOpacity: driver.interpolate({ inputRange: [0, 0.45, 0.55, 1], outputRange: [0, 0, 0.05, 1] }),
    logoScale: driver.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.7, 1] }),
    desktopScale: driver.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.7, 1] })
  };
}
