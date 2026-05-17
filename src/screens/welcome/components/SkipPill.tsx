import React from "react";
import { Pressable, Text } from "react-native";
import { welcomeCopy } from "../data/welcomeCopy";
import { styles } from "../styles";

export function SkipPill({ onPress, topInset = 0 }: { onPress: () => void; topInset?: number }) {
  return (
    <Pressable
      accessibilityHint="Skips PC setup. You can connect later from Settings."
      accessibilityLabel={welcomeCopy.hero.skip}
      accessibilityRole="button"
      hitSlop={12}
      onPress={onPress}
      style={({ pressed }) => [
        styles.skipGhost,
        { top: Math.max(topInset + 10, 18) },
        pressed ? styles.skipGhostPressed : null
      ]}
    >
      <Text style={styles.skipGhostText}>{welcomeCopy.hero.skip}</Text>
    </Pressable>
  );
}
