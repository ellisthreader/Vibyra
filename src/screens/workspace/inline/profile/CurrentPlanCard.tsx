import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../../../context/AppContext";
import { styles } from "../../styles";
import { formatPlanLabel } from "../index";
import { PLAN_TIERS, PlanKey } from "./types";

export function CurrentPlanCard() {
  const app = useAppContext();
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web"
    }).start();
  }, [entrance]);

  const currentKey = (app.accountPlan.trim().toLowerCase() || "free") as PlanKey;
  const tier = PLAN_TIERS.find((t) => t.key === currentKey) ?? PLAN_TIERS[0];

  return (
    <Animated.View
      style={[
        styles.currentPlanCard,
        {
          opacity: entrance,
          transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }]
        }
      ]}
    >
      <View style={styles.currentPlanIconBox}>
        <Ionicons name="diamond" color="#C259FF" size={22} />
      </View>
      <View style={styles.currentPlanCopy}>
        <Text style={styles.currentPlanKicker}>Current plan</Text>
        <Text style={styles.currentPlanName}>{formatPlanLabel(app.accountPlan).replace(" Plan", "")}</Text>
        <Text style={styles.currentPlanMeta}>{tier.tokens}</Text>
      </View>
      <View style={styles.currentPlanChip}>
        <Text style={styles.currentPlanChipText}>Current</Text>
      </View>
    </Animated.View>
  );
}
