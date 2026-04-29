import React from "react";
import { Image, ImageStyle, StyleSheet, View } from "react-native";

type Props = {
  compact?: boolean;
  style?: ImageStyle;
};

export function VibyraLogo({ compact, style }: Props) {
  return (
    <View style={styles.logoWrap}>
      <Image
        resizeMode="contain"
        source={require("../assets/vibyra.png")}
        style={[compact ? styles.compactLogo : styles.logo, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  compactLogo: {
    height: 44,
    width: 44
  },
  logo: {
    height: 190,
    width: 230
  },
  logoWrap: {
    alignItems: "center"
  }
});
