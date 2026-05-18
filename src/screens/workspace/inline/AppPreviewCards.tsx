import React, { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { GeneratedApp } from "../../../types/domain";
import { styles } from "../styles";

export function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sequence = (value: Animated.Value, delay: number) => Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 360, delay, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(value, { toValue: 0, duration: 360, useNativeDriver: Platform.OS !== "web" })
      ])
    );
    const animation = Animated.parallel([sequence(dot1, 0), sequence(dot2, 140), sequence(dot3, 280)]);
    animation.start();
    return () => animation.stop();
  }, [dot1, dot2, dot3]);

  const dotStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }]
  });

  return (
    <View style={styles.typingIndicator}>
      <Animated.View style={[styles.typingDot, dotStyle(dot1)]} />
      <Animated.View style={[styles.typingDot, dotStyle(dot2)]} />
      <Animated.View style={[styles.typingDot, dotStyle(dot3)]} />
    </View>
  );
}

export function AppPreviewCard({ app, onOpen }: { app: GeneratedApp; onOpen: (app: GeneratedApp) => void }) {
  return (
    <Pressable accessibilityLabel={`Open ${app.title} preview`} accessibilityRole="button" onPress={() => onOpen(app)} style={styles.appPreviewCard}>
      <LinearGradient colors={["#8E3CFF", "#5D24D8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.appPreviewIcon}>
        <Ionicons name="play" color="#FFFFFF" size={20} />
      </LinearGradient>
      <View style={styles.appPreviewBody}>
        <Text style={styles.appPreviewLabel}>Runnable preview</Text>
        <Text numberOfLines={1} style={styles.appPreviewTitle}>{app.title}</Text>
        <Text numberOfLines={1} style={styles.appPreviewHint}>Preview is ready to open</Text>
      </View>
      <View style={styles.appPreviewOpenButton}>
        <Text style={styles.appPreviewOpenText}>Open</Text>
        <Ionicons name="chevron-forward" color="#C9C2D6" size={18} />
      </View>
    </Pressable>
  );
}
