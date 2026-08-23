import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Text } from "react-native";
import { styles } from "../styles";

export function GradientWord({ text }: { text: string }) {
  return (
    <MaskedView
      style={styles.syncGradientMask}
      maskElement={<Text style={[styles.syncTitleInline, styles.syncTitleGradientMaskText]}>{text}</Text>}
    >
      <LinearGradient
        colors={["#A6ADBA", "#7490FF", "#5B7CFA", "#5B7CFA", "#7490FF"]}
        locations={[0, 0.27, 0.56, 0.78, 1]}
        start={{ x: 0, y: 0.52 }}
        end={{ x: 1, y: 0.52 }}
        style={styles.syncGradientFill}
      />
    </MaskedView>
  );
}
