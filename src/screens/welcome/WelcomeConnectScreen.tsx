import { StatusBar } from "expo-status-bar";
import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ConstellationBackdrop } from "./components/ConstellationBackdrop";
import { SkipConfirmSheet } from "./components/SkipConfirmSheet";
import { SkipPill } from "./components/SkipPill";
import { useWelcomeFlow } from "./hooks/useWelcomeFlow";
import { StepConnected } from "./steps/StepConnected";
import { StepDownload } from "./steps/StepDownload";
import { StepHero } from "./steps/StepHero";
import { StepSetup } from "./steps/StepSetup";
import { styles } from "./styles";

export function WelcomeConnectScreen() {
  const flow = useWelcomeFlow();
  const insets = useSafeAreaInsets();
  const heroLike = flow.step === "hero" || flow.step === "connected";
  const backdropStep = flow.step === "approve" ? "setup" : flow.step;

  return (
    <SafeAreaView edges={[]} style={styles.shell}>
      <StatusBar style="light" />
      <ConstellationBackdrop step={backdropStep} withParticles={heroLike} />
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
          <ScrollView
            bounces={false}
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
          >
            {flow.step === "hero" ? <StepHero flow={flow} /> : null}
            {flow.step === "download" ? <StepDownload flow={flow} /> : null}
            {flow.step === "setup" || flow.step === "approve" ? <StepSetup flow={flow} /> : null}
            {flow.step === "connected" ? <StepConnected flow={flow} /> : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      {flow.step !== "connected" ? <SkipPill onPress={flow.requestSkip} topInset={insets.top} /> : null}
      <SkipConfirmSheet onCancel={flow.cancelSkip} onConfirm={flow.confirmSkip} visible={flow.skipPromptOpen} />
    </SafeAreaView>
  );
}
