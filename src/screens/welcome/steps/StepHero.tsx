import React from "react";
import { Animated, Pressable, View } from "react-native";
import { useAppContext } from "../../../context/AppContext";
import { welcomeCopy } from "../data/welcomeCopy";
import { useHeroIntro } from "../hooks/useHeroIntro";
import { WelcomeFlow } from "../types";
import { styles } from "../styles";

export function StepHero({ flow }: { flow: WelcomeFlow }) {
  const app = useAppContext();
  const intro = useHeroIntro();
  const firstName = pickFirstName(app.authName);
  const welcomeLine = firstName ? `${welcomeCopy.hero.welcome} ${firstName}` : welcomeCopy.hero.welcomeFallback;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.centerStack}>
        <Animated.Text
          style={[
            styles.welcomeLine,
            { opacity: intro.welcome.opacity, transform: [{ translateY: intro.welcome.translateY }, { scale: intro.welcome.scale }] }
          ]}
        >
          {welcomeLine}
        </Animated.Text>
        <Animated.Text
          style={[
            styles.tagline,
            { opacity: intro.tagline.opacity, transform: [{ translateY: intro.tagline.translateY }] }
          ]}
        >
          {welcomeCopy.hero.tagline}
        </Animated.Text>
      </View>
      <Animated.View
        style={{
          alignSelf: "stretch",
          opacity: intro.cta.opacity,
          transform: [{ translateY: intro.cta.translateY }]
        }}
      >
        <Pressable
          accessibilityHint="Continue to download Vibyra Desktop"
          accessibilityLabel={welcomeCopy.hero.cta}
          accessibilityRole="button"
          onPress={flow.goToDownload}
          style={({ pressed }) => [styles.ghostBtn, pressed ? styles.ghostBtnPressed : null]}
        >
          <Animated.Text style={styles.ghostBtnText}>{welcomeCopy.hero.cta}</Animated.Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function pickFirstName(authName: string) {
  const trimmed = authName.trim();
  if (!trimmed) return "";
  const first = trimmed.split(/\s+/)[0];
  return first.length > 14 ? "" : first;
}
