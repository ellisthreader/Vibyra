import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../../styles";
import { PlanKey, PlanTier } from "./types";

export function BillingPlanPill({ tier, isCurrent, index, onSelect }: {
  tier: PlanTier;
  isCurrent: boolean;
  index: number;
  onSelect: (key: PlanKey) => void;
}) {
  const entrance = useRef(new Animated.Value(0)).current;
  const native = Platform.OS !== "web";

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 360,
      delay: 220 + index * 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native
    }).start();
  }, [entrance, index, native]);

  return (
    <Animated.View
      style={{
        opacity: entrance,
        transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }]
      }}
    >
      <Pressable
        onPress={() => onSelect(tier.key)}
        style={({ pressed }) => [styles.planPill, pressed ? { opacity: 0.85 } : null]}
      >
        <View style={[styles.planPillIconBox, { backgroundColor: tier.pillIconBg }]}>
          <Ionicons name={tier.pillIcon} color={tier.pillIconColor} size={20} />
        </View>
        <View style={styles.planPillCopy}>
          <Text style={styles.planPillName}>{tier.name}</Text>
          <Text style={styles.planPillTokens}>{tier.tokens}</Text>
        </View>
        <Text style={styles.planPillPrice}>{tier.price}</Text>
        {isCurrent ? (
          <View style={styles.planPillCurrentChip}>
            <Text style={styles.planPillCurrentChipText}>Current</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" color="#9C97AE" size={18} />
        )}
      </Pressable>
    </Animated.View>
  );
}
