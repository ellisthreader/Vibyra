import React, { useEffect } from "react";
import { Animated, Text, View } from "react-native";
import { PrimaryButton } from "../components/PrimaryButton";
import { SuccessBurst } from "../components/SuccessBurst";
import { welcomeCopy } from "../data/welcomeCopy";
import { useEntrance } from "../hooks/useEntrance";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { WelcomeFlow } from "../types";
import { styles } from "../styles";

export function StepConnected({ flow }: { flow: WelcomeFlow }) {
  const entrance = useEntrance("connected");
  const reduced = useReduceMotion();

  useEffect(() => {
    if (reduced) return;
    const timer = setTimeout(() => flow.finish(), 2400);
    return () => clearTimeout(timer);
  }, [flow, reduced]);

  return (
    <Animated.View style={[{ flex: 1, opacity: entrance.opacity, transform: [{ translateY: entrance.translateY }] }]}>
      <View style={styles.centerStack}>
        <SuccessBurst />
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{welcomeCopy.connected.eyebrow}</Text>
          <Text style={styles.title}>{welcomeCopy.connected.title}</Text>
          <Text style={styles.body1}>{welcomeCopy.connected.body}</Text>
        </View>
      </View>
      <View style={styles.bottomStack}>
        <PrimaryButton iconName="arrow-forward" label={welcomeCopy.connected.cta} onPress={flow.finish} />
      </View>
    </Animated.View>
  );
}
