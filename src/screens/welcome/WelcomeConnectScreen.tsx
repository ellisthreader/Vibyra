import { StatusBar } from "expo-status-bar";
import React from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ConstellationBackdrop } from "./components/ConstellationBackdrop";
import { SkipConfirmSheet } from "./components/SkipConfirmSheet";
import { StepIndicator } from "./components/StepIndicator";
import { useWelcomeFlow } from "./hooks/useWelcomeFlow";
import { StepApprove } from "./steps/StepApprove";
import { StepConnected } from "./steps/StepConnected";
import { StepHero } from "./steps/StepHero";
import { StepSetup } from "./steps/StepSetup";
import { styles } from "./styles";

export function WelcomeConnectScreen() {
  const flow = useWelcomeFlow();
  const insets = useSafeAreaInsets();
  const heroLike = flow.step === "hero" || flow.step === "connected";

  return (
    <SafeAreaView edges={[]} style={styles.shell}>
      <StatusBar style="light" />
      <ConstellationBackdrop withParticles={heroLike} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.shell}>
        <View
          style={[
            styles.body,
            {
              paddingTop: Math.max(insets.top + 12, 24),
              paddingBottom: Math.max(insets.bottom + 16, 22)
            }
          ]}
        >
          <StepIndicator step={flow.step} />
          {flow.step === "hero" ? <StepHero flow={flow} /> : null}
          {flow.step === "setup" ? <StepSetup flow={flow} /> : null}
          {flow.step === "approve" ? <StepApprove flow={flow} /> : null}
          {flow.step === "connected" ? <StepConnected flow={flow} /> : null}
        </View>
      </KeyboardAvoidingView>
      <SkipConfirmSheet onCancel={flow.cancelSkip} onConfirm={flow.confirmSkip} visible={flow.skipPromptOpen} />
    </SafeAreaView>
  );
}
