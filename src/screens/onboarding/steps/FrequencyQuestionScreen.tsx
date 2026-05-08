import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, ImageSourcePropType, Pressable, Text, View } from "react-native";
import { UsageFrequency } from "../types";
import { styles } from "../styles";

export function FrequencyQuestionScreen(props: {
  options: Array<{ label: string; value: UsageFrequency; icon: ImageSourcePropType }>;
  selected: UsageFrequency | null;
  onSelect: (value: UsageFrequency) => void;
}) {
  const entrance = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.cubic), useNativeDriver: true })
      ])
    );

    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [entrance, pulse]);

  const translateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const opacity = entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const selectedScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] });
  const selectedGlow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.42, 0.75] });

  return (
    <Animated.View style={[styles.frequencyQuestion, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.frequencyHeader}>
        <Text style={styles.frequencyTitle}>How often will you code with Vibyra?</Text>
        <Text style={styles.frequencyHelper}>This helps us personalize your experience.</Text>
      </View>

      <View style={styles.frequencyOptionGrid}>
        {props.options.map((option) => {
          const selected = props.selected === option.value;

          return (
            <Animated.View
              key={option.value}
              style={[
                styles.frequencyOptionMotion,
                selected ? { transform: [{ scale: selectedScale }] } : null
              ]}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.frequencyOption,
                  selected ? styles.frequencyOptionSelected : null,
                  pressed ? styles.frequencyOptionPressed : null
                ]}
                onPress={() => props.onSelect(option.value)}
              >
                {selected ? <Animated.View style={[styles.frequencySelectedGlow, { opacity: selectedGlow, pointerEvents: "none" }]} /> : null}
                <Image resizeMode="contain" source={option.icon} style={styles.frequencyOptionIcon} />
                <Text style={styles.frequencyOptionTitle}>{option.label}</Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </Animated.View>
  );
}
