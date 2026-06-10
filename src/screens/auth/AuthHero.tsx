import React from "react";
import { Animated, Text, View } from "react-native";
import { VibyraLogo } from "../../components/VibyraLogo";
import { GradientTitleWord } from "./GradientTitleWord";
import { styles } from "./styles";
import { logoAspectRatio } from "./types";
import { useAuthEntrance } from "./useAuthEntrance";

export function AuthHero({
  entrance,
  emailFormVisible,
  fitScale,
  logoWidth,
  titleFontSize
}: {
  entrance: ReturnType<typeof useAuthEntrance>;
  emailFormVisible: boolean;
  fitScale: number;
  logoWidth: number;
  titleFontSize: number;
}) {
  return (
    <View style={styles.heroStack}>
      <Animated.View
        style={[
          styles.logoStage,
          {
            opacity: entrance.logoOpacity,
            transform: [{ translateY: entrance.logoTranslateY }, { scale: entrance.logoScale }]
          }
        ]}
      >
        <VibyraLogo style={{ height: logoWidth / logoAspectRatio, width: logoWidth }} />
      </Animated.View>
      <Animated.View
        style={[
          styles.titleStage,
          {
            opacity: entrance.titleOpacity,
            marginTop: (emailFormVisible ? 20 : 32) * fitScale,
            transform: [{ translateY: entrance.titleTranslateY }]
          }
        ]}
      >
        <View style={styles.titleRow}>
          <Text style={[styles.title, { fontSize: titleFontSize, lineHeight: titleFontSize * 1.16 }]}>Welcome to </Text>
          <GradientTitleWord fontSize={titleFontSize} text="Vibyra" />
        </View>
      </Animated.View>
    </View>
  );
}
