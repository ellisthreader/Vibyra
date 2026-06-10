import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ProjectPublishStatus } from "../../../utils/communityApi";
import { publishProgressFromStatus, type PublishFlowResult } from "./ProjectPublishResult";
import { modalStyles } from "./ProjectPublishModal.styles";
import { colors } from "../../../styles/theme";

type PublishResult = NonNullable<PublishFlowResult>;

export function ProjectPublishCompletion({ onDone, result, status }: { onDone: (result: PublishResult) => void; result: PublishResult; status?: ProjectPublishStatus | null }) {
  const [now, setNow] = useState(Date.now());
  const opacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    opacity.setValue(0);
    pulse.setValue(0);
    scale.setValue(0.94);
    Animated.parallel([
      Animated.timing(opacity, { duration: 220, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true }),
      Animated.spring(scale, { damping: 14, mass: 0.7, stiffness: 150, toValue: 1, useNativeDriver: true }),
      Animated.timing(pulse, { duration: 820, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true })
    ]).start();
    return () => {
      opacity.stopAnimation();
      pulse.stopAnimation();
      scale.stopAnimation();
    };
  }, [opacity, pulse, result.message, result.title, result.tone, scale]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const progress = publishProgressFromStatus(status, now);
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
        {progress && result.showReleaseProgress ? (
          <View style={modalStyles.publishProgress}>
            <View style={modalStyles.publishProgressMeta}>
              <Text style={modalStyles.publishProgressStep}>{progress.step}</Text>
              <Text style={modalStyles.publishProgressPercent}>{progress.percent}%</Text>
            </View>
            <View accessibilityLabel={`Publishing ${progress.percent}% complete`} accessibilityRole="progressbar" style={modalStyles.publishProgressTrack}>
              <View style={[modalStyles.publishProgressFill, { width: `${progress.percent}%` }]} />
            </View>
            <Text style={modalStyles.publishProgressEstimate}>{progress.estimate}</Text>
          </View>
        ) : null}
        <Pressable style={modalStyles.doneButton} onPress={() => onDone(result)}>
          <Text style={[modalStyles.secondaryText, { color: colors.text }]}>Back to Projects</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
