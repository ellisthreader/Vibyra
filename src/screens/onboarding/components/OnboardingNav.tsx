import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { colors } from "../../../styles/theme";
import { OnboardingStep } from "../types";
import { styles } from "../styles";

export function OnboardingNav({
  showingMoment,
  step,
  isArtQuizStep,
  canContinue,
  profileGenerating,
  navRowExtra,
  back,
  next
}: {
  showingMoment: boolean;
  step: OnboardingStep;
  isArtQuizStep: boolean;
  canContinue: boolean;
  profileGenerating: boolean;
  navRowExtra: object | null;
  back: () => void;
  next: () => void;
}) {
  const continueLabel = showingMoment ? "Continue" : step === 4 ? "Skip" : step === 5 ? "Continue" : step === 6 ? "Start free trial" : "Continue";
  const useArtButtons = isArtQuizStep || showingMoment;

  return (
    <View style={[styles.navRow, useArtButtons ? styles.navRowFrequency : null, showingMoment ? styles.navRowMoment : null, navRowExtra]}>
      {showingMoment || step > 0 ? (
        <Pressable style={[styles.backButton, useArtButtons ? styles.backButtonArt : null]} onPress={back}>
          <View style={useArtButtons ? styles.backIconArt : null}>
            <Ionicons name="chevron-back" color={useArtButtons ? "#D8CAFF" : colors.muted} size={useArtButtons ? 31 : 18} />
          </View>
          <Text style={[styles.backText, useArtButtons ? styles.backTextArt : null]}>Back</Text>
        </Pressable>
      ) : (
        <View />
      )}
      <Pressable
        disabled={!canContinue || profileGenerating}
        style={[styles.nextButton, useArtButtons ? styles.nextButtonFrequency : null, !canContinue || profileGenerating ? styles.nextButtonDisabled : null]}
        onPress={next}
      >
        {useArtButtons ? (
          <LinearGradient
            colors={["rgba(183, 86, 255, 0.98)", "rgba(118, 42, 216, 0.95)", "rgba(59, 18, 128, 0.96)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.nextButtonFrequencyGradient}
          >
            <Text style={[styles.nextText, styles.nextTextFrequency]}>{continueLabel}</Text>
            <Ionicons name="arrow-forward" color={colors.text} size={28} />
          </LinearGradient>
        ) : (
          <>
            <Text style={styles.nextText}>{continueLabel}</Text>
            <Ionicons name="arrow-forward" color={colors.text} size={18} />
          </>
        )}
      </Pressable>
    </View>
  );
}
