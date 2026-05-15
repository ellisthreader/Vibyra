import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text } from "react-native";
import { welcomeCopy } from "../data/welcomeCopy";
import { styles } from "../styles";

export function SkipPill({ onPress, floating = false }: { onPress: () => void; floating?: boolean }) {
  return (
    <Pressable
      accessibilityHint="Skips PC setup. You can connect later from Settings."
      accessibilityLabel={welcomeCopy.hero.skip}
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={[styles.skipPill, floating ? styles.skipPillTop : null]}
    >
      <Text style={styles.skipPillText}>{welcomeCopy.hero.skip}</Text>
      <Ionicons accessible={false} color="rgba(232, 218, 255, 0.7)" name="chevron-forward" size={14} />
    </Pressable>
  );
}
