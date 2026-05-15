import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";

export function useFloatLoop(enabled = true, range = 7, duration = 2600) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) {
      value.setValue(0);
      return;
    }

    const loop = Animated.loop(Animated.sequence([
      Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.cubic), useNativeDriver: supportsNativeAnimation }),
      Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.cubic), useNativeDriver: supportsNativeAnimation })
    ]));

    loop.start();
    return () => loop.stop();
  }, [duration, enabled, value]);

  return value.interpolate({ inputRange: [0, 1], outputRange: [0, -range] });
}
