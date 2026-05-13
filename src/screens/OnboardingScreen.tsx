import { Asset } from "expo-asset";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import { Image, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppContext } from "../context/AppContext";
import { AnimatedStep } from "./onboarding/components/AnimatedStep";
import { PersistentOnboardingBackground } from "./onboarding/components/Backdrop";
import { OnboardingNav } from "./onboarding/components/OnboardingNav";
import { ProgressIndicator } from "./onboarding/components/ProgressIndicator";
import { connectBackdrop, frequencyBackdrop, initialAnswers, momentBackdrop, resultBackdrop } from "./onboarding/data/options";
import { personaModels } from "./onboarding/data/personas";
import { deviceOptions, frequencyOptions, intentOptions } from "./onboarding/data/quizOptions";
import { calculatePersona, canContinueFromStep } from "./onboarding/persona";
import { Answers, BuildIntent, BuilderIdentity, DeviceMode, OnboardingBackdropVariant, OnboardingStep, QuizStep, UsageDepth, UsageFrequency } from "./onboarding/types";
import { styles } from "./onboarding/styles";
import { FrequencyQuestionScreen } from "./onboarding/steps/FrequencyQuestionScreen";
import { IdentityQuestion } from "./onboarding/steps/IdentityQuestion";
import { InsightScreen } from "./onboarding/steps/InsightScreen";
import { PricingScreen } from "./onboarding/steps/PricingScreen";
import { ProfileGeneratingScreen } from "./onboarding/steps/ProfileGeneratingScreen";
import { QuestionMomentScreen } from "./onboarding/steps/QuestionMomentScreen";
import { QuestionScreen } from "./onboarding/steps/QuestionScreen";
import { SetupScreen } from "./onboarding/steps/SetupScreen";
import { UsageSlider } from "./onboarding/steps/UsageSlider";

export function OnboardingScreen() {
  const app = useAppContext();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<OnboardingStep>(() => app.onboardingComplete ? 7 : 0);
  const [momentStep, setMomentStep] = useState<QuizStep | null>(null);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [profileGenerating, setProfileGenerating] = useState(false);
  const persona = useMemo(() => calculatePersona(answers), [answers]);
  const personaModel = personaModels[persona];
  const progressStep = Math.min((momentStep ?? step) + 1, 7);
  const showingMoment = momentStep !== null;
  const isPaywall = step === 6 && !showingMoment;
  const isGeneratingProfile = step === 5 && profileGenerating && !showingMoment;
  const isResultStep = step === 5 && !profileGenerating && !showingMoment;
  const isFullBleedStep = isPaywall || showingMoment || isGeneratingProfile || step === 7;
  const isStyledQuizStep = !showingMoment && step >= 0 && step <= 4;
  const isArtQuizStep = isStyledQuizStep || isGeneratingProfile || isResultStep;
  const hideFlowChrome = isGeneratingProfile;
  const canContinue = showingMoment || canContinueFromStep(step, answers);
  const backdropVariant: OnboardingBackdropVariant = isResultStep
    ? "result"
    : (isStyledQuizStep || isGeneratingProfile)
      ? "quiz"
      : "default";

  useEffect(() => {
    if (step !== 5) {
      setProfileGenerating(false);
      return;
    }

    setProfileGenerating(true);
    const timer = setTimeout(() => setProfileGenerating(false), 1900);
    return () => clearTimeout(timer);
  }, [step, persona]);

  useEffect(() => {
    void Asset.loadAsync([connectBackdrop, frequencyBackdrop, momentBackdrop, resultBackdrop]);
  }, []);

  const selectFrequency = (frequency: UsageFrequency) => setAnswers((current) => ({ ...current, frequency }));
  const toggleIntent = (intent: BuildIntent) => {
    setAnswers((current) => ({
      ...current,
      intent: current.intent.includes(intent) ? current.intent.filter((item) => item !== intent) : [...current.intent, intent]
    }));
  };
  const selectDevice = (device: DeviceMode) => setAnswers((current) => ({ ...current, device }));
  const selectDepth = (depth: UsageDepth) => setAnswers((current) => ({ ...current, depth }));
  const selectIdentity = (identity: BuilderIdentity) => {
    setAnswers((current) => ({ ...current, identity }));
    setStep(5);
  };

  const finishOnboarding = () => {
    app.completeOnboarding();
    setStep(7);
  };

  const next = () => {
    if (momentStep !== null) {
      const nextStep = Math.min(momentStep + 1, 7) as OnboardingStep;
      setMomentStep(null);
      setStep(nextStep);
      return;
    }

    if (step === 2) {
      setMomentStep(step as QuizStep);
      return;
    }

    setStep((current) => Math.min(current + 1, 7) as OnboardingStep);
  };

  const back = () => {
    if (momentStep !== null) {
      setMomentStep(null);
      return;
    }

    setStep((current) => Math.max(current - 1, 0) as OnboardingStep);
  };

  const navExtra = isArtQuizStep
    ? { paddingBottom: Math.max(insets.bottom + 6, 16), marginTop: 14 }
    : showingMoment
      ? { paddingBottom: Math.max(insets.bottom + 6, 16) }
      : null;

  return (
    <SafeAreaView edges={isFullBleedStep || isArtQuizStep ? [] : ["top", "right", "bottom", "left"]} style={styles.shell}>
      <StatusBar style="light" />
      <LinearGradient colors={["#08070D", "#100C18", "#07070A"]} style={styles.shell}>
        <PersistentOnboardingBackground variant={backdropVariant} />
        {step < 7 ? (
          <View style={[
            styles.flow,
            isPaywall ? styles.flowPaywall : null,
            showingMoment ? styles.flowMoment : null,
            isFullBleedStep ? styles.flowFullBleed : null,
            isResultStep ? [styles.flowResult, { paddingTop: Math.max(insets.top + 8, 18), paddingBottom: Math.max(insets.bottom + 10, 18) }] : null,
            isStyledQuizStep || isGeneratingProfile ? [styles.flowFrequency, { paddingTop: Math.max(insets.top + 8, 18), paddingBottom: Math.max(insets.bottom + 10, 18) }] : null
          ]}>
            {showingMoment ? (
              <>
                <Image fadeDuration={0} source={momentBackdrop} resizeMode="stretch" style={styles.frequencyBackdropImage} />
                <LinearGradient
                  colors={["rgba(4, 7, 13, 0.36)", "rgba(4, 7, 13, 0.58)", "rgba(4, 7, 13, 0.38)"]}
                  locations={[0, 0.52, 1]}
                  style={[styles.quizBackdropShade, { pointerEvents: "none" }]}
                />
                <LinearGradient
                  colors={["rgba(0, 0, 0, 0.42)", "rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.52)"]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={[styles.quizBackdropVignette, { pointerEvents: "none" }]}
                />
              </>
            ) : null}
            {isPaywall || hideFlowChrome ? null : (
              <View style={showingMoment ? [styles.momentProgressSafe, { paddingHorizontal: 20, paddingTop: Math.max(insets.top + 10, 20) }] : null}>
                <ProgressIndicator
                  step={progressStep}
                  style={isResultStep ? styles.resultProgressWrap : isStyledQuizStep ? styles.frequencyProgressWrap : undefined}
                  total={7}
                />
              </View>
            )}

            <AnimatedStep fullBleed={isFullBleedStep} transitionKey={showingMoment ? `moment-${momentStep}` : `step-${step}`}>
              {showingMoment ? <QuestionMomentScreen step={momentStep} answers={answers} /> : null}
              {!showingMoment && step === 0 ? <FrequencyQuestionScreen options={frequencyOptions} selected={answers.frequency} onSelect={selectFrequency} /> : null}
              {!showingMoment && step === 1 ? <QuestionScreen title="What are you building?" helper="Select all that fit." options={intentOptions} selected={answers.intent} onSelect={toggleIntent} /> : null}
              {!showingMoment && step === 2 ? <QuestionScreen title="What devices will you use?" options={deviceOptions} selected={answers.device} onSelect={selectDevice} /> : null}
              {!showingMoment && step === 3 ? <UsageSlider title="How much will you build?" selected={answers.depth ?? "light"} onSelect={selectDepth} /> : null}
              {!showingMoment && step === 4 ? <IdentityQuestion selected={answers.identity} onSelect={selectIdentity} /> : null}
              {!showingMoment && step === 5 ? (profileGenerating ? <ProfileGeneratingScreen /> : <InsightScreen personaId={persona} persona={personaModel} />) : null}
              {!showingMoment && step === 6 ? <PricingScreen persona={personaModel} onClose={finishOnboarding} /> : null}
            </AnimatedStep>

            {isPaywall || hideFlowChrome ? null : (
              <OnboardingNav
                showingMoment={showingMoment}
                step={step}
                isArtQuizStep={isArtQuizStep}
                canContinue={canContinue}
                profileGenerating={profileGenerating}
                navRowExtra={navExtra}
                back={back}
                next={next}
              />
            )}
          </View>
        ) : (
          <SetupScreen />
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}
