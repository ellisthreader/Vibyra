import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

export function useAuthEntrance() {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoTranslateY = useRef(new Animated.Value(-120)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const restOpacity = useRef(new Animated.Value(0)).current;
  const restTranslateY = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    const logoEntrance = Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, friction: 8, tension: 44, useNativeDriver: true }),
      Animated.timing(logoTranslateY, { toValue: 0, duration: 1100, easing: Easing.bezier(0.2, 0.92, 0.2, 1), useNativeDriver: true })
    ]);

    const titleEntrance = Animated.parallel([
      Animated.timing(titleOpacity, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(titleTranslateY, { toValue: 0, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    ]);

    const restEntrance = Animated.parallel([
      Animated.timing(restOpacity, { toValue: 1, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(restTranslateY, { toValue: 0, duration: 760, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true })
    ]);

    logoEntrance.start(() => {
      titleEntrance.start(() => {
        restEntrance.start();
      });
    });
  }, [logoOpacity, logoScale, logoTranslateY, titleOpacity, titleTranslateY, restOpacity, restTranslateY]);

  return { logoOpacity, logoScale, logoTranslateY, titleOpacity, titleTranslateY, restOpacity, restTranslateY };
}
