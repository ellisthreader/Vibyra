import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { View } from "react-native";
import { colors } from "../../../styles/theme";
import { styles } from "../styles";

export function ProgressIndicator({ step, style, total }: { step: number; style?: object; total: number }) {
  const progress = `${(step / total) * 100}%` as `${number}%`;

  return (
    <View style={[styles.progressWrap, style]}>
      <View style={styles.progressRail}>
        <LinearGradient
          colors={[colors.accent, colors.magenta, colors.amber]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: progress }]}
        />
      </View>
    </View>
  );
}
