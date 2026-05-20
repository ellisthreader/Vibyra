import React, { useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PublishFlowResult } from "./ProjectPublishResult";
import { modalStyles } from "./ProjectPublishModal.styles";

type PublishResult = NonNullable<PublishFlowResult>;

export function ProjectPublishCompletion({ onDone, result }: { onDone: (result: PublishResult) => void; result: PublishResult }) {
  const onDoneRef = useRef(onDone);
  const opacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    opacity.setValue(0);
    pulse.setValue(0);
    scale.setValue(0.94);
    Animated.parallel([
      Animated.timing(opacity, { duration: 220, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true }),
      Animated.spring(scale, { damping: 14, mass: 0.7, stiffness: 150, toValue: 1, useNativeDriver: true }),
      Animated.timing(pulse, { duration: 820, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true })
    ]).start();
    const timeout = setTimeout(() => onDoneRef.current(result), 1850);
    return () => {
      clearTimeout(timeout);
      opacity.stopAnimation();
      pulse.stopAnimation();
      scale.stopAnimation();
    };
  }, [opacity, pulse, result, scale]);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1.18] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.42, 0] });
  const iconName = result.tone === "danger" ? "alert-circle-outline" : result.tone === "success" ? "checkmark" : "time-outline";
  const iconColor = result.tone === "danger" ? "#FF9AAD" : result.tone === "success" ? "#7CF1B3" : "#D9CBFF";

  return (
    <View style={modalStyles.completionWrap}>
      <Animated.View style={[modalStyles.completionBody, { opacity, transform: [{ scale }] }]}>
        <View style={modalStyles.completionIconWrap}>
          <Animated.View style={[modalStyles.completionPulse, { opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />
          <View style={[modalStyles.completionIcon, result.tone === "success" ? modalStyles.completionIconSuccess : result.tone === "danger" ? modalStyles.completionIconDanger : null]}>
            <Ionicons name={iconName} color={iconColor} size={34} />
          </View>
        </View>
        <Text style={modalStyles.completionTitle}>{result.title}</Text>
        <Text style={modalStyles.completionText}>{result.message}</Text>
      </Animated.View>
    </View>
  );
}
