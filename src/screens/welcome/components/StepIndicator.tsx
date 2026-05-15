import React from "react";
import { View } from "react-native";
import { WelcomeStep } from "../types";
import { styles } from "../styles";

const STEPS: WelcomeStep[] = ["hero", "setup", "approve", "connected"];

export function StepIndicator({ step }: { step: WelcomeStep }) {
  const index = STEPS.indexOf(step);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: STEPS.length - 1, now: index }}
      style={styles.indicator}
    >
      {STEPS.map((current, i) => {
        const active = i === index;
        const complete = i < index;
        return (
          <View
            key={current}
            style={[
              styles.indicatorDot,
              active ? styles.indicatorDotActive : null,
              complete ? styles.indicatorDotComplete : null
            ]}
          />
        );
      })}
    </View>
  );
}
