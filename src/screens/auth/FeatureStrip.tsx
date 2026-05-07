import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Text, View } from "react-native";
import { featureItems } from "./types";
import { featureStyles as styles } from "./featureStyles";

export function FeatureStrip({ scale }: { scale: number }) {
  const iconTileSize = 56 * scale;
  const iconSize = 32 * scale;
  const featureTitleSize = 17 * scale;
  const featureBodySize = 15 * scale;

  return (
    <View style={[styles.featureStrip, { marginBottom: 27 * scale }]}>
      {featureItems.map((item, index) => (
        <React.Fragment key={item.title}>
          <View style={styles.featureItem}>
            <LinearGradient
              colors={["rgba(176, 65, 255, 0.38)", "rgba(83, 26, 154, 0.54)"]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={[styles.featureIconTile, { borderRadius: 20 * scale, height: iconTileSize, marginBottom: 11 * scale, width: iconTileSize }]}
            >
              {item.symbol === "braces" ? (
                <Text style={[styles.bracesIcon, { fontSize: 30 * scale, lineHeight: 36 * scale }]}>{"{ }"}</Text>
              ) : (
                <Ionicons name={item.icon} size={iconSize} color="#B15BFF" />
              )}
            </LinearGradient>
            <Text style={[styles.featureTitle, { fontSize: featureTitleSize, lineHeight: featureTitleSize * 1.35 }]}>{item.title}</Text>
            <Text style={[styles.featureBody, { fontSize: featureBodySize, lineHeight: featureBodySize * 1.4 }]}>{item.body}</Text>
          </View>
          {index < featureItems.length - 1 ? <View style={[styles.featureDivider, { height: 64 * scale, marginTop: 16 * scale }]} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}
