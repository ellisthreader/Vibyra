import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, View } from "react-native";
import { colors } from "../../../styles/theme";
import { useRadarPulse } from "../hooks/useRadarPulse";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { styles } from "../styles";

export function RadarPulse({ active }: { active: boolean }) {
  const reduced = useReduceMotion();
  const rings = useRadarPulse(active && !reduced);

  return (
    <View accessible={false} style={styles.radarWrap}>
      {rings.map((ring, index) => (
        <Animated.View
          key={index}
          style={[styles.radarRing, { opacity: ring.opacity, transform: [{ scale: ring.scale }] }]}
        />
      ))}
      <View style={styles.radarCore}>
        <Ionicons color={colors.text} name="wifi" size={28} />
      </View>
    </View>
  );
}
