import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";

export function useEntrance(triggerKey: string | number = 0, offsetY = 18, duration = 520) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    value.setValue(0);
    Animated.timing(value, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: supportsNativeAnimation
    }).start();
  }, [duration, triggerKey, value]);

  return {
    opacity: value,
    translateY: value.interpolate({ inputRange: [0, 1], outputRange: [offsetY, 0] })
  };
}
