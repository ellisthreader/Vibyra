import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Text } from "react-native";
import { styles } from "./styles";

export function GradientTitleWord({ fontSize, text }: { fontSize: number; text: string }) {
  const titleStyle = [styles.title, { fontSize, lineHeight: fontSize * 1.16 }];

  return (
    <MaskedView maskElement={<Text style={titleStyle}>{text}</Text>} style={{ height: fontSize * 1.2, width: fontSize * 3.23 }}>
      <LinearGradient
        colors={["#FFFFFF", "#C65BFF", "#FF38C5", "#FFB24A"]}
        locations={[0, 0.34, 0.68, 1]}
        start={{ x: 0, y: 0.48 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.gradientTitleFill}
      />
    </MaskedView>
  );
}
