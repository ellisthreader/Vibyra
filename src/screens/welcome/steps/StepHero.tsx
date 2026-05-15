import React from "react";
import { Animated, Text, View } from "react-native";
import { VibyraLogo } from "../../../components/VibyraLogo";
import { useAppContext } from "../../../context/AppContext";
import { PrimaryButton } from "../components/PrimaryButton";
import { SkipPill } from "../components/SkipPill";
import { welcomeCopy } from "../data/welcomeCopy";
import { useEntrance } from "../hooks/useEntrance";
import { useFloatLoop } from "../hooks/useFloatLoop";
import { WelcomeFlow } from "../types";
import { styles } from "../styles";

export function StepHero({ flow }: { flow: WelcomeFlow }) {
  const app = useAppContext();
  const float = useFloatLoop();
  const entrance = useEntrance("hero");
  const firstName = pickFirstName(app.authName);

  return (
    <Animated.View style={[{ flex: 1, opacity: entrance.opacity, transform: [{ translateY: entrance.translateY }] }]}>
      <View style={styles.centerStack}>
        <Animated.View style={[styles.logoFloat, { transform: [{ translateY: float }] }]}>
          <VibyraLogo />
        </Animated.View>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{welcomeCopy.hero.eyebrow}</Text>
          <Text style={styles.title}>
            {welcomeCopy.hero.titlePrefix} {firstName ? <Text style={styles.titleAccent}>{firstName}</Text> : null}
            {firstName ? "," : ""} {welcomeCopy.hero.titleSuffix}
          </Text>
          <Text style={styles.body1}>{welcomeCopy.hero.body}</Text>
        </View>
      </View>
      <View style={styles.bottomStack}>
        <PrimaryButton
          accessibilityHint="Begins the PC connection flow"
          iconName="sparkles"
          label={welcomeCopy.hero.cta}
          onPress={flow.goToSetup}
        />
        <SkipPill onPress={flow.requestSkip} />
      </View>
    </Animated.View>
  );
}

function pickFirstName(authName: string) {
  const trimmed = authName.trim();
  if (!trimmed) return "";
  const first = trimmed.split(/\s+/)[0];
  return first.length > 14 ? "" : first;
}
