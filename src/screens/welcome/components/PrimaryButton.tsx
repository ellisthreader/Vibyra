import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, GestureResponderEvent, LayoutChangeEvent, Pressable, Text, View } from "react-native";
import { colors } from "../../../styles/theme";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { styles } from "../styles";

type Props = {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  iconName?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  accessibilityHint?: string;
};

export function PrimaryButton({ label, onPress, iconName = "arrow-forward", disabled, accessibilityHint }: Props) {
  const [width, setWidth] = useState(0);
  const shimmer = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const reduced = useReduceMotion();

  useEffect(() => {
    if (reduced || disabled || width === 0) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 1600, easing: Easing.out(Easing.cubic), useNativeDriver: supportsNativeAnimation }),
      Animated.timing(shimmer, { toValue: 0, duration: 0, useNativeDriver: supportsNativeAnimation }),
      Animated.delay(1800)
    ]));
    loop.start();
    return () => loop.stop();
  }, [disabled, reduced, shimmer, width]);

  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-80, Math.max(width, 60) + 30] });

  const onPressIn = () => Animated.spring(press, { toValue: 0.97, useNativeDriver: supportsNativeAnimation, bounciness: 0, speed: 28 }).start();
  const onPressOut = () => Animated.spring(press, { toValue: 1, useNativeDriver: supportsNativeAnimation, bounciness: 6, speed: 18 }).start();
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <Animated.View style={{ alignSelf: "stretch", transform: [{ scale: press }] }} onLayout={onLayout}>
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [styles.primaryBtn, pressed ? styles.primaryBtnPressed : null, disabled ? { opacity: 0.5 } : null]}
      >
        <LinearGradient
          colors={["#762CFF", "#9D35FF", "#B13CFF"]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.primaryBtnGradient}
        >
          {iconName ? <Ionicons accessible={false} color={colors.text} name={iconName} size={22} /> : null}
          <Text style={styles.primaryBtnText}>{label}</Text>
          <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, overflow: "hidden" }}>
            <Animated.View style={[styles.shimmer, { transform: [{ translateX }, { rotate: "12deg" }] }]} />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
