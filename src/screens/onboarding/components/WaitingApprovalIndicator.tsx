import React, { useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";
import { styles } from "../styles";

export function WaitingApprovalIndicator({ message }: { message: string }) {
  const dotOne = useRef(new Animated.Value(0.35)).current;
  const dotTwo = useRef(new Animated.Value(0.35)).current;
  const dotThree = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.stagger(180, [dotOne, dotTwo, dotThree].map((dot) => (
        Animated.sequence([
          Animated.timing(dot, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: supportsNativeAnimation }),
          Animated.timing(dot, { toValue: 0.35, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: supportsNativeAnimation })
        ])
      )))
    );

    loop.start();
    return () => loop.stop();
  }, [dotOne, dotTwo, dotThree]);

  return (
    <View style={styles.connectWaiting}>
      <Text style={styles.connectWaitingTitle}>{message}</Text>
      <View style={styles.connectWaitingDots}>
        {[dotOne, dotTwo, dotThree].map((dot, index) => (
          <Animated.View key={index} style={[styles.connectWaitingDot, { opacity: dot, transform: [{ scale: dot }] }]} />
        ))}
      </View>
    </View>
  );
}
