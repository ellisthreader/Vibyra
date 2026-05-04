import { Ionicons } from "@expo/vector-icons";
import MaskedView from "@react-native-masked-view/masked-view";
import { Asset } from "expo-asset";
import { useIAP, ProductSubscription, Purchase } from "expo-iap";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  LayoutChangeEvent,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinkButton, PrimaryButton } from "../components/Buttons";
import { VibyraLogo } from "../components/VibyraLogo";
import { useAppContext } from "../context/AppContext";
import { colors } from "../styles/theme";
import { RememberedDesktop } from "../types/domain";

type UsageFrequency = "rarely" | "occasionally" | "few_times_week" | "every_day";
type BuildIntent = "exploring" | "learning" | "side_project" | "app_website" | "work" | "automation";
type DeviceMode = "phone_first" | "phone_computer" | "computer_quick_edits" | "other";
type UsageDepth = "light" | "steady" | "heavy" | "max";
type BuilderIdentity = "beginner" | "student" | "developer" | "founder_freelancer";
type Persona =
  | "idea_explorer"
  | "learning_builder"
  | "hobby_builder"
  | "side_project_builder"
  | "app_builder"
  | "workflow_automator"
  | "product_developer"
  | "power_engineer";
type Plan = "Starter" | "Builder" | "Pro";
type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
type QuizStep = 0 | 1 | 2 | 3 | 4;
type BillingPeriod = "monthly" | "annual";
type OnboardingBackdropVariant = "default" | "quiz" | "result";

type Answers = {
  frequency: UsageFrequency | null;
  intent: BuildIntent[];
  device: DeviceMode | null;
  depth: UsageDepth | null;
  identity: BuilderIdentity | null;
};

type PersonaModel = {
  name: string;
  description: string;
  recommendedPlan: Plan;
  icon: ImageSourcePropType;
};

const personaModels: Record<Persona, PersonaModel> = {
  idea_explorer: {
    name: "Idea Explorer",
    description: "Perfect for testing sparks, rough concepts, and small creative experiments.",
    recommendedPlan: "Starter",
    icon: require("../assets/persona-icons/idea-explorer.png")
  },
  learning_builder: {
    name: "Learning Builder",
    description: "For learning by making real things, one small project at a time.",
    recommendedPlan: "Starter",
    icon: require("../assets/persona-icons/learning-builder.png")
  },
  hobby_builder: {
    name: "Hobby Builder",
    description: "Perfect for experimenting, learning, and building small ideas from anywhere.",
    recommendedPlan: "Starter",
    icon: require("../assets/persona-icons/hobby-builder.png")
  },
  side_project_builder: {
    name: "Side Project Builder",
    description: "For turning spare-time ideas into usable projects without heavy setup.",
    recommendedPlan: "Builder",
    icon: require("../assets/persona-icons/side-project-builder.png")
  },
  app_builder: {
    name: "App Builder",
    description: "For creators building real projects, apps, websites, and tools regularly.",
    recommendedPlan: "Builder",
    icon: require("../assets/persona-icons/app-builder.png")
  },
  workflow_automator: {
    name: "Workflow Automator",
    description: "For building small tools and automations that save time every week.",
    recommendedPlan: "Builder",
    icon: require("../assets/persona-icons/workflow-automator.png")
  },
  product_developer: {
    name: "Product Developer",
    description: "For people using vibe coding as part of their daily workflow.",
    recommendedPlan: "Pro",
    icon: require("../assets/persona-icons/product-developer.png")
  },
  power_engineer: {
    name: "Power Engineer",
    description: "For serious builders who want maximum credits and fast iteration from anywhere.",
    recommendedPlan: "Pro",
    icon: require("../assets/persona-icons/power-engineer.png")
  }
};

const connectBackdrop = require("../assets/front-page-nebula.png");
const frequencyBackdrop = require("../assets/frequency-background.png");
const resultBackdrop = require("../assets/result-background.png");

const weeklyOutcomes: Record<UsageFrequency, string[]> = {
  rarely: [
    "Prototype a real idea",
    "Ship a polished landing page",
    "Create a useful mini tool",
    "Turn a spark into something clickable"
  ],
  occasionally: [
    "Prototype a real idea",
    "Ship a polished landing page",
    "Create a useful mini tool",
    "Turn a spark into something clickable"
  ],
  few_times_week: [
    "Launch 2-3 working app screens",
    "Build tools that save hours",
    "Upgrade a real project fast",
    "Ship something people can try"
  ],
  every_day: [
    "Ship multiple serious features",
    "Automate painful work",
    "Create production-ready tools",
    "Move from idea to launch faster"
  ]
};

const personaOutcomes: Record<Persona, string[]> = {
  idea_explorer: [
    "Prototype 3-5 bold ideas",
    "Turn one spark into a demo",
    "Create a shareable landing page",
    "Find the idea worth building"
  ],
  learning_builder: [
    "Build a real practice app",
    "Learn by changing live code",
    "Finish a polished mini project",
    "Level up with every session"
  ],
  hobby_builder: [
    "Build a useful weekend app",
    "Ship a clean landing page",
    "Create tools for yourself",
    "Make small ideas feel real"
  ],
  side_project_builder: [
    "Ship a standout side-project feature",
    "Build a dashboard or tool",
    "Polish an idea enough to share",
    "Launch faster without waiting"
  ],
  app_builder: [
    "Launch 2-3 working app screens",
    "Build a real website or tool",
    "Create a product people can try",
    "Iterate like a full team"
  ],
  workflow_automator: [
    "Automate a repeated task",
    "Build your own workflow tool",
    "Save hours with small scripts",
    "Connect quick edits across devices"
  ],
  product_developer: [
    "Ship multiple product features",
    "Create production-ready tools",
    "Automate part of your workflow",
    "Move faster from mobile or desktop"
  ],
  power_engineer: [
    "Run rapid-fire build iterations",
    "Ship production-ready tools",
    "Push serious projects daily",
    "Turn momentum into launches"
  ]
};

const personaInsights: Record<Persona, { bullets: Array<{ icon: keyof typeof Ionicons.glyphMap; text: string }> }> = {
  idea_explorer: {
    bullets: [
      { icon: "sparkles-outline", text: "Turn rough ideas into clickable prototypes" },
      { icon: "color-wand-outline", text: "Test bold concepts without setup" },
      { icon: "rocket-outline", text: "Find the idea worth building next" },
      { icon: "bulb-outline", text: "Explore multiple concepts before committing" }
    ]
  },
  learning_builder: {
    bullets: [
      { icon: "school-outline", text: "Learn by building real apps, not tutorials" },
      { icon: "code-slash-outline", text: "Practice with instant AI guidance" },
      { icon: "trophy-outline", text: "Finish polished projects you can show" },
      { icon: "library-outline", text: "Build confidence with every project" }
    ]
  },
  hobby_builder: {
    bullets: [
      { icon: "hammer-outline", text: "Build useful weekend apps and tools" },
      { icon: "phone-portrait-outline", text: "Experiment from anywhere when ideas hit" },
      { icon: "sparkles-outline", text: "Make small ideas feel premium fast" },
      { icon: "happy-outline", text: "Create projects for fun without heavy setup" }
    ]
  },
  side_project_builder: {
    bullets: [
      { icon: "layers-outline", text: "Shape side projects into real products" },
      { icon: "construct-outline", text: "Build dashboards, tools, and launch pages" },
      { icon: "rocket-outline", text: "Ship faster without waiting for a team" },
      { icon: "trending-up-outline", text: "Turn spare time into visible progress" }
    ]
  },
  app_builder: {
    bullets: [
      { icon: "apps-outline", text: "Create apps, websites, and product screens" },
      { icon: "build-outline", text: "Iterate on real features in minutes" },
      { icon: "rocket-outline", text: "Launch projects that feel ready to use" },
      { icon: "phone-portrait-outline", text: "Design mobile-ready flows from anywhere" }
    ]
  },
  workflow_automator: {
    bullets: [
      { icon: "flash-outline", text: "Automate repetitive work with custom tools" },
      { icon: "sync-outline", text: "Connect quick edits across devices" },
      { icon: "time-outline", text: "Save hours every week with small builds" },
      { icon: "briefcase-outline", text: "Create tools that fit your exact workflow" }
    ]
  },
  product_developer: {
    bullets: [
      { icon: "cube-outline", text: "Ship serious app and software features" },
      { icon: "desktop-outline", text: "Build production-ready tools for work" },
      { icon: "trending-up-outline", text: "Move from idea to launch much faster" },
      { icon: "git-branch-outline", text: "Iterate across product screens and systems" }
    ]
  },
  power_engineer: {
    bullets: [
      { icon: "terminal-outline", text: "Run rapid high-volume build iterations" },
      { icon: "rocket-outline", text: "Ship complex apps, tools, and automations" },
      { icon: "flame-outline", text: "Keep momentum across serious projects" },
      { icon: "speedometer-outline", text: "Push faster with maximum build capacity" }
    ]
  }
};

const resultBulletAccents = [
  { color: "#7C4DFF", glow: "rgba(124, 77, 255, 0.28)", border: "rgba(124, 77, 255, 0.58)" },
  { color: "#B642FF", glow: "rgba(182, 66, 255, 0.28)", border: "rgba(182, 66, 255, 0.58)" },
  { color: "#FF55C8", glow: "rgba(255, 85, 200, 0.24)", border: "rgba(255, 85, 200, 0.52)" },
  { color: "#FF6EA9", glow: "rgba(255, 110, 169, 0.24)", border: "rgba(255, 110, 169, 0.52)" }
];

const plans: Array<{
  name: Plan;
  monthlyPrice: string;
  yearlyPrice: string;
  yearlySaving: string;
  targetUser: string;
  generations: string;
  modelAccess: string;
  limits: string;
  estimatedCost: string;
  profitMargin: string;
  summary: string;
  features: string[];
  icon: ImageSourcePropType;
}> = [
  {
    name: "Starter",
    monthlyPrice: "£5.99 / month",
    yearlyPrice: "£49.99 / year",
    yearlySaving: "Save ~30%",
    targetUser: "Casual / testing",
    generations: "50-100 generations/month",
    modelAccess: "Cheaper models by default",
    limits: "Large outputs are limited",
    estimatedCost: "£1.50-£2.50",
    profitMargin: "60-70%",
    summary: "For testing ideas, learning, and occasional builds.",
    features: [
      "Get starter credits each month",
      "Access efficient AI models",
      "Learn how to prompt and build with AI",
      "Generate simple app and image assets",
      "Build small tools from anywhere"
    ],
    icon: require("../assets/plan-icons/starter.png")
  },
  {
    name: "Builder",
    monthlyPrice: "£12.99 / month",
    yearlyPrice: "£109.99 / year",
    yearlySaving: "Save ~30%",
    targetUser: "Regular builders",
    generations: "200-400 generations/month",
    modelAccess: "Balanced mix of models",
    limits: "Higher build limits",
    estimatedCost: "£4-£6",
    profitMargin: "55-65%",
    summary: "The main plan for regular apps, websites, and tools.",
    features: [
      "Get builder credits each month",
      "Access to Premium models",
      "Build apps, websites, and workflow tools",
      "Generate custom image and sound assets",
      "Connect database and authentication"
    ],
    icon: require("../assets/plan-icons/builder.png")
  },
  {
    name: "Pro",
    monthlyPrice: "£24.99 / month",
    yearlyPrice: "£199.99 / year",
    yearlySaving: "Save ~33%",
    targetUser: "Serious users",
    generations: "800-1200 generations/month",
    modelAccess: "Better models and priority usage",
    limits: "Fastest, highest-limit building",
    estimatedCost: "£10-£15",
    profitMargin: "40-60%",
    summary: "For serious workflows, bigger projects, and faster iteration.",
    features: [
      "Get maximum credits each month",
      "Access best models with priority usage",
      "Ship production-ready apps faster",
      "Generate advanced assets and automations",
      "Build serious projects across devices"
    ],
    icon: require("../assets/plan-icons/pro.png")
  }
];

const membershipProductIds: Record<Plan, Record<BillingPeriod, string>> = {
  Starter: {
    monthly: "app.vibyra.membership.starter.monthly",
    annual: "app.vibyra.membership.starter.annual"
  },
  Builder: {
    monthly: "app.vibyra.membership.builder.monthly",
    annual: "app.vibyra.membership.builder.annual"
  },
  Pro: {
    monthly: "app.vibyra.membership.pro.monthly",
    annual: "app.vibyra.membership.pro.annual"
  }
};

const membershipSkus = Object.values(membershipProductIds).flatMap((periods) => Object.values(periods));

const initialAnswers: Answers = {
  frequency: null,
  intent: [],
  device: null,
  depth: "light",
  identity: null
};

const optionIcons = {
  rarely: require("../assets/onboarding-icons/rarely.png"),
  occasionally: require("../assets/onboarding-icons/occasionally.png"),
  fewTimesWeek: require("../assets/onboarding-icons/few-times-week.png"),
  everyDay: require("../assets/onboarding-icons/every-day.png"),
  exploring: require("../assets/onboarding-icons/exploring.png"),
  learning: require("../assets/onboarding-icons/learning.png"),
  sideProject: require("../assets/onboarding-icons/side-project.png"),
  appWebsite: require("../assets/onboarding-icons/app-website.png"),
  work: require("../assets/onboarding-icons/work.png"),
  automation: require("../assets/onboarding-icons/automation.png"),
  phoneFirst: require("../assets/onboarding-icons/phone-first.png"),
  phoneComputer: require("../assets/onboarding-icons/phone-computer.png"),
  computerEdits: require("../assets/onboarding-icons/computer-edits.png"),
  other: require("../assets/onboarding-icons/anywhere.png"),
  light: require("../assets/onboarding-icons/light.png"),
  steady: require("../assets/onboarding-icons/steady.png"),
  heavy: require("../assets/onboarding-icons/heavy.png"),
  max: require("../assets/onboarding-icons/max.png")
} satisfies Record<string, ImageSourcePropType>;

const momentIcons: Partial<Record<QuizStep, ImageSourcePropType>> = {
  2: require("../assets/moment-icons/device-sync-hero.png")
};

const identityOptions: Array<{ label: string; value: BuilderIdentity; icon: ImageSourcePropType }> = [
  { label: "Beginner", value: "beginner", icon: require("../assets/identity-icons/beginner.png") },
  { label: "Student", value: "student", icon: require("../assets/identity-icons/student.png") },
  { label: "Developer", value: "developer", icon: require("../assets/identity-icons/developer.png") },
  { label: "Founder / freelancer", value: "founder_freelancer", icon: require("../assets/identity-icons/founder-freelancer.png") }
];

const depthOptions: Array<{ label: string; value: UsageDepth; icon: ImageSourcePropType }> = [
  { label: "Light", value: "light", icon: optionIcons.light },
  { label: "Steady", value: "steady", icon: optionIcons.steady },
  { label: "Heavy", value: "heavy", icon: optionIcons.heavy },
  { label: "Max", value: "max", icon: optionIcons.max }
];

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
    void Asset.loadAsync([connectBackdrop, frequencyBackdrop, resultBackdrop]);
  }, []);

  const selectFrequency = (frequency: UsageFrequency) => {
    setAnswers((current) => ({ ...current, frequency }));
  };

  const toggleIntent = (intent: BuildIntent) => {
    setAnswers((current) => ({
      ...current,
      intent: current.intent.includes(intent)
        ? current.intent.filter((item) => item !== intent)
        : [...current.intent, intent]
    }));
  };

  const selectDevice = (device: DeviceMode) => {
    setAnswers((current) => ({ ...current, device }));
  };

  const selectDepth = (depth: UsageDepth) => {
    setAnswers((current) => ({ ...current, depth }));
  };

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
            isResultStep ? [
              styles.flowResult,
              {
                paddingTop: Math.max(insets.top + 8, 18),
                paddingBottom: Math.max(insets.bottom + 10, 18)
              }
            ] : null,
            isStyledQuizStep || isGeneratingProfile ? [
              styles.flowFrequency,
              {
                paddingTop: Math.max(insets.top + 8, 18),
                paddingBottom: Math.max(insets.bottom + 10, 18)
              }
            ] : null
          ]}>
            {isPaywall || hideFlowChrome ? null : (
              <View
                style={showingMoment ? [
                  styles.momentProgressSafe,
                  { paddingHorizontal: 20, paddingTop: Math.max(insets.top + 10, 20) }
                ] : null}
              >
                <ProgressIndicator
                  step={progressStep}
                  style={isResultStep ? styles.resultProgressWrap : isStyledQuizStep ? styles.frequencyProgressWrap : undefined}
                  total={7}
                />
              </View>
            )}

            <AnimatedStep fullBleed={isFullBleedStep} transitionKey={showingMoment ? `moment-${momentStep}` : `step-${step}`}>
              {showingMoment ? (
                <QuestionMomentScreen step={momentStep} answers={answers} />
              ) : null}

              {!showingMoment && step === 0 ? (
                <FrequencyQuestionScreen
                  options={[
                    { label: "Rarely", value: "rarely", icon: optionIcons.rarely },
                    { label: "Occasionally", value: "occasionally", icon: optionIcons.occasionally },
                    { label: "A few times", value: "few_times_week", icon: optionIcons.fewTimesWeek },
                    { label: "Every day", value: "every_day", icon: optionIcons.everyDay }
                  ]}
                  selected={answers.frequency}
                  onSelect={selectFrequency}
                />
              ) : null}

              {!showingMoment && step === 1 ? (
                <QuestionScreen
                  title="What are you building?"
                  helper="Select all that fit."
                  options={[
                    { label: "Ideas", value: "exploring", icon: optionIcons.exploring },
                    { label: "Learning", value: "learning", icon: optionIcons.learning },
                    { label: "Side project", value: "side_project", icon: optionIcons.sideProject },
                    { label: "App / website", value: "app_website", icon: optionIcons.appWebsite },
                    { label: "Work", value: "work", icon: optionIcons.work },
                    { label: "Automations", value: "automation", icon: optionIcons.automation }
                  ]}
                  selected={answers.intent}
                  onSelect={toggleIntent}
                />
              ) : null}

              {!showingMoment && step === 2 ? (
                <QuestionScreen
                  title="What devices will you use?"
                  options={[
                    { label: "Phone", value: "phone_first", icon: optionIcons.phoneFirst },
                    { label: "Phone + computer", value: "phone_computer", icon: optionIcons.phoneComputer },
                    { label: "Computer", value: "computer_quick_edits", icon: optionIcons.computerEdits },
                    { label: "Other", value: "other", icon: optionIcons.other }
                  ]}
                  selected={answers.device}
                  onSelect={selectDevice}
                />
              ) : null}

              {!showingMoment && step === 3 ? (
                <UsageSlider
                  title="How much will you build?"
                  selected={answers.depth ?? "light"}
                  onSelect={selectDepth}
                />
              ) : null}

              {!showingMoment && step === 4 ? (
                <IdentityQuestion
                  selected={answers.identity}
                  onSelect={selectIdentity}
                />
              ) : null}

              {!showingMoment && step === 5 ? (
                profileGenerating ? <ProfileGeneratingScreen /> : <InsightScreen personaId={persona} persona={personaModel} />
              ) : null}
              {!showingMoment && step === 6 ? <PricingScreen persona={personaModel} onClose={finishOnboarding} /> : null}
            </AnimatedStep>

            {isPaywall || hideFlowChrome ? null : <View style={[
              styles.navRow,
              isArtQuizStep ? [
                styles.navRowFrequency,
                { paddingBottom: Math.max(insets.bottom + 6, 16), marginTop: 14 }
              ] : null,
              showingMoment ? [
                styles.navRowMoment,
                { paddingBottom: Math.max(insets.bottom + 14, 20), paddingHorizontal: 20 }
              ] : null
            ]}>
              {showingMoment || step > 0 ? (
                <Pressable style={[styles.backButton, isArtQuizStep ? styles.backButtonArt : null]} onPress={back}>
                  <View style={isArtQuizStep ? styles.backIconArt : null}>
                    <Ionicons name="chevron-back" color={isArtQuizStep ? "#D8CAFF" : colors.muted} size={isArtQuizStep ? 31 : 18} />
                  </View>
                  <Text style={[styles.backText, isArtQuizStep ? styles.backTextArt : null]}>Back</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable
                disabled={!canContinue || profileGenerating}
                style={[
                  styles.nextButton,
                  isArtQuizStep ? styles.nextButtonFrequency : null,
                  !canContinue || profileGenerating ? styles.nextButtonDisabled : null
                ]}
                onPress={next}
              >
                {isArtQuizStep ? (
                  <LinearGradient
                    colors={["rgba(183, 86, 255, 0.98)", "rgba(118, 42, 216, 0.95)", "rgba(59, 18, 128, 0.96)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.nextButtonFrequencyGradient}
                  >
                    <Text style={[styles.nextText, styles.nextTextFrequency]}>{step === 4 ? "Skip" : "Continue"}</Text>
                    <Ionicons name="arrow-forward" color={colors.text} size={28} />
                  </LinearGradient>
                ) : (
                  <>
                    <Text style={styles.nextText}>
                      {showingMoment ? "Continue" : step === 4 ? "Skip" : step === 5 ? "Continue" : step === 6 ? "Start free trial" : "Continue"}
                    </Text>
                    <Ionicons name="arrow-forward" color={colors.text} size={18} />
                  </>
                )}
              </Pressable>
            </View>}
          </View>
        ) : (
          <SetupScreen />
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

function calculatePersona(answers: Answers): Persona {
  const { frequency, intent, device, depth } = answers;
  const hasIntent = (value: BuildIntent) => intent.includes(value);
  let persona: Persona = "hobby_builder";

  if (
    frequency === "every_day" &&
    hasIntent("work") &&
    device === "computer_quick_edits" &&
    (depth === "heavy" || depth === "max")
  ) {
    persona = "power_engineer";
  } else if (frequency === "every_day" && (hasIntent("work") || hasIntent("app_website") || hasIntent("automation"))) {
    persona = "product_developer";
  } else if (hasIntent("automation") || hasIntent("work")) {
    persona = "workflow_automator";
  } else if (hasIntent("app_website")) {
    persona = "app_builder";
  } else if (hasIntent("side_project")) {
    persona = "side_project_builder";
  } else if (hasIntent("learning") && (frequency === "rarely" || frequency === "occasionally" || intent.length <= 2)) {
    persona = "learning_builder";
  } else if (hasIntent("exploring") && (frequency === "rarely" || frequency === "occasionally") && intent.length <= 2) {
    persona = "idea_explorer";
  } else if (frequency === "few_times_week") {
    persona = "side_project_builder";
  }

  if (
    answers.identity === "founder_freelancer" &&
    (persona === "app_builder" || persona === "workflow_automator") &&
    (frequency === "few_times_week" || frequency === "every_day" || depth === "heavy" || depth === "max")
  ) {
    return "product_developer";
  }

  if (
    answers.identity === "developer" &&
    persona === "app_builder" &&
    (frequency === "every_day" || depth === "heavy" || depth === "max")
  ) {
    return "product_developer";
  }

  if (answers.identity === "student" && persona === "hobby_builder" && hasIntent("learning")) {
    return "learning_builder";
  }

  return persona;
}

function canContinueFromStep(step: OnboardingStep, answers: Answers) {
  if (step === 0) return Boolean(answers.frequency);
  if (step === 1) return answers.intent.length > 0;
  if (step === 2) return Boolean(answers.device);
  if (step === 3) return Boolean(answers.depth);
  return true;
}

function getOnboardingDesktopStatusLabel(status: RememberedDesktop["status"]) {
  if (status === "current") return "Connected now";
  if (status === "online") return "Available nearby";
  if (status === "checking") return "Checking activity...";
  return "Remembered, not reachable";
}

function getOnboardingDesktopStatusStyle(status: RememberedDesktop["status"]) {
  if (status === "current") return styles.desktopResultStatusCurrent;
  if (status === "online") return styles.desktopResultStatusOnline;
  if (status === "checking") return styles.desktopResultStatusChecking;
  return styles.desktopResultStatusOffline;
}

function AnimatedStep({ children, fullBleed = false, transitionKey }: { children: React.ReactNode; fullBleed?: boolean; transitionKey: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    const startOpacity = hasAnimatedRef.current ? 0.94 : 1;
    const startOffset = hasAnimatedRef.current ? (fullBleed ? 6 : 10) : 0;

    opacity.stopAnimation();
    translateY.stopAnimation();
    opacity.setValue(startOpacity);
    translateY.setValue(startOffset);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: hasAnimatedRef.current ? 220 : 0,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: hasAnimatedRef.current ? 260 : 0,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]).start();
    hasAnimatedRef.current = true;
  }, [opacity, transitionKey, translateY]);

  return (
    <Animated.View style={[styles.stepBody, fullBleed ? styles.stepBodyFullBleed : null, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

function PersistentOnboardingBackground({ variant }: { variant: OnboardingBackdropVariant }) {
  const defaultOpacity = useRef(new Animated.Value(variant === "default" ? 1 : 0)).current;
  const quizOpacity = useRef(new Animated.Value(variant === "quiz" ? 1 : 0)).current;
  const resultOpacity = useRef(new Animated.Value(variant === "result" ? 1 : 0)).current;

  useEffect(() => {
    const duration = 240;

    Animated.parallel([
      Animated.timing(defaultOpacity, {
        toValue: variant === "default" ? 1 : 0,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(quizOpacity, {
        toValue: variant === "quiz" ? 1 : 0,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(resultOpacity, {
        toValue: variant === "result" ? 1 : 0,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]).start();
  }, [defaultOpacity, quizOpacity, resultOpacity, variant]);

  return (
    <View pointerEvents="none" style={styles.persistentBackdrop}>
      <Animated.View style={[styles.backdropLayer, { opacity: defaultOpacity }]}>
        <OnboardingBackdrop />
      </Animated.View>
      <Animated.View style={[styles.backdropLayer, { opacity: quizOpacity }]}>
        <Image fadeDuration={0} source={frequencyBackdrop} resizeMode="stretch" style={styles.frequencyBackdropImage} />
      </Animated.View>
      <Animated.View style={[styles.backdropLayer, { opacity: resultOpacity }]}>
        <Image fadeDuration={0} source={resultBackdrop} resizeMode="stretch" style={styles.resultBackdropImage} />
      </Animated.View>
    </View>
  );
}

function OnboardingBackdrop() {
  return (
    <View pointerEvents="none" style={styles.backdrop}>
      <LinearGradient
        colors={["rgba(109, 59, 255, 0.22)", "rgba(242, 58, 205, 0.08)", "rgba(255, 179, 71, 0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.backdropBand, styles.backdropBandTop]}
      />
      <LinearGradient
        colors={["rgba(255, 179, 71, 0.14)", "rgba(242, 58, 205, 0.08)", "rgba(109, 59, 255, 0)"]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.backdropBand, styles.backdropBandBottom]}
      />
      <View style={styles.backdropGrid} />
    </View>
  );
}

function QuestionMomentScreen(props: {
  step: QuizStep;
  answers: Answers;
}) {
  const insets = useSafeAreaInsets();
  const { answers, step } = props;
  const content = getMomentContent(answers);
  const image = momentIcons[step] ?? momentIcons[2];
  const contentInsets = {
    paddingBottom: Math.max(insets.bottom + 14, 28),
    paddingTop: Math.max(insets.top + 14, 28)
  };

  return (
    <LinearGradient
      colors={["#04070C", "#061A24", "#07070A"]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.syncScreen}
    >
      <View pointerEvents="none" style={styles.syncAuraCyan} />
      <View pointerEvents="none" style={styles.syncAuraPurple} />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(46, 235, 255, 0.16)", "rgba(109, 59, 255, 0.08)", "rgba(242, 58, 205, 0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.syncAuroraBand}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(255, 179, 71, 0.11)", "rgba(242, 58, 205, 0.08)", "rgba(46, 235, 255, 0)"]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.syncAuroraBandBottom}
      />
      <View pointerEvents="none" style={styles.syncStarOne} />
      <View pointerEvents="none" style={styles.syncStarTwo} />

      <ScrollView contentContainerStyle={[styles.syncContent, contentInsets]} showsVerticalScrollIndicator={false}>
        <View style={styles.syncPill}>
          <Ionicons name="sync" color="#2EEBFF" size={17} />
          <Text style={styles.syncPillText}>Cross-device sync</Text>
        </View>

        <View style={styles.syncTitleBlock}>
          <Text style={styles.syncTitle}>Start anywhere.</Text>
          <View style={styles.syncTitleLine}>
            <Text style={styles.syncTitleInline}>Continue </Text>
            <GradientWord text="Everywhere." />
          </View>
        </View>

        <Text style={styles.syncSubtitle}>{content.body}</Text>

        <View style={styles.syncHero}>
          <View style={styles.syncHeroGlowBlue} />
          <View style={styles.syncHeroGlowPink} />
          <View style={styles.syncHeroGlowPurple} />
          <Image
            resizeMode="contain"
            source={image}
            style={styles.syncHeroImage}
          />
        </View>
        <View style={styles.syncCards}>
          {syncFeatures.map((feature) => (
            <View
              key={feature.title}
              style={[
                styles.syncCard,
                { backgroundColor: feature.backgroundColor, borderColor: feature.borderColor }
              ]}
            >
              <View
                style={[
                  styles.syncCardIcon,
                  {
                    backgroundColor: feature.iconBackgroundColor,
                    borderColor: feature.borderColor,
                    shadowColor: feature.color
                  }
                ]}
              >
                <Ionicons name={feature.icon} color={feature.color} size={21} />
              </View>
              <View style={styles.syncCardCopy}>
                <Text style={styles.syncCardTitle}>{feature.title}</Text>
                <Text style={styles.syncCardBody}>{feature.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function GradientWord({ text }: { text: string }) {
  return (
    <MaskedView
      style={styles.syncGradientMask}
      maskElement={<Text style={[styles.syncTitleInline, styles.syncTitleGradientMaskText]}>{text}</Text>}
    >
      <LinearGradient
        colors={["#08D8FF", "#149CFF", "#5861F2", "#944AE2", "#D83EC9"]}
        locations={[0, 0.27, 0.56, 0.78, 1]}
        start={{ x: 0, y: 0.52 }}
        end={{ x: 1, y: 0.52 }}
        style={styles.syncGradientFill}
      />
    </MaskedView>
  );
}

const syncFeatures: Array<{
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  backgroundColor: string;
  borderColor: string;
  iconBackgroundColor: string;
}> = [
  {
    title: "Instant handoff",
    body: "Switch devices in a second.",
    icon: "swap-horizontal-outline",
    color: "#8AF7FF",
    backgroundColor: "rgba(46, 235, 255, 0.08)",
    borderColor: "rgba(138, 247, 255, 0.42)",
    iconBackgroundColor: "rgba(46, 235, 255, 0.14)"
  },
  {
    title: "Live Sync",
    body: "Updates in real time.",
    icon: "radio-outline",
    color: "#FF7DE3",
    backgroundColor: "rgba(242, 58, 205, 0.09)",
    borderColor: "rgba(255, 125, 227, 0.42)",
    iconBackgroundColor: "rgba(242, 58, 205, 0.14)"
  },
  {
    title: "Access whenever",
    body: "Open projects anytime.",
    icon: "phone-portrait-outline",
    color: "#A76DFF",
    backgroundColor: "rgba(109, 59, 255, 0.1)",
    borderColor: "rgba(167, 109, 255, 0.44)",
    iconBackgroundColor: "rgba(109, 59, 255, 0.16)"
  }
];

function getMomentContent(answers: Answers) {
  const content: Record<DeviceMode, { title: string; body: string; bullets: string[] }> = {
    phone_first: {
      title: "Build from your pocket",
      body: "Vibyra turns quick phone moments into real project progress, so ideas do not wait for your desk.",
      bullets: ["Capture ideas instantly", "Make fast edits anywhere", "Keep momentum alive"]
    },
    phone_computer: {
      title: "Phone to computer, seamless",
      body: "Start on your phone, continue on your computer, and keep the whole build in sync wherever you are.",
      bullets: ["Start on phone", "Continue on computer", "Stay synced anywhere"]
    },
    computer_quick_edits: {
      title: "Deep work meets quick edits",
      body: "Use your computer for serious building, then jump onto your phone when a small change needs to happen fast.",
      bullets: ["Full desktop focus", "Fast mobile tweaks", "Smooth project handoff"]
    },
    other: {
      title: "Built around your setup",
      body: "Vibyra keeps the building flow flexible, polished, and ready for the way you actually work.",
      bullets: ["Flexible workflow", "Portable projects", "Clean handoff"]
    }
  };

  return { kicker: "Connected workspace", ...(content[answers.device ?? "phone_computer"]) };
}

function FrequencyQuestionScreen(props: {
  options: Array<{ label: string; value: UsageFrequency; icon: ImageSourcePropType }>;
  selected: UsageFrequency | null;
  onSelect: (value: UsageFrequency) => void;
}) {
  const entrance = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1700,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1700,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true
        })
      ])
    );

    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [entrance, pulse]);

  const translateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const opacity = entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const selectedScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] });
  const selectedGlow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.42, 0.75] });

  return (
    <Animated.View style={[styles.frequencyQuestion, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.frequencyHeader}>
        <Text style={styles.frequencyTitle}>How often will you code with Vibyra?</Text>
        <Text style={styles.frequencyHelper}>This helps us personalize your experience.</Text>
      </View>

      <View style={styles.frequencyOptionGrid}>
        {props.options.map((option) => {
          const selected = props.selected === option.value;

          return (
            <Animated.View
              key={option.value}
              style={[
                styles.frequencyOptionMotion,
                selected ? { transform: [{ scale: selectedScale }] } : null
              ]}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.frequencyOption,
                  selected ? styles.frequencyOptionSelected : null,
                  pressed ? styles.frequencyOptionPressed : null
                ]}
                onPress={() => props.onSelect(option.value)}
              >
                {selected ? <Animated.View pointerEvents="none" style={[styles.frequencySelectedGlow, { opacity: selectedGlow }]} /> : null}
                <Image resizeMode="contain" source={option.icon} style={styles.frequencyOptionIcon} />
                <Text style={styles.frequencyOptionTitle}>{option.label}</Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </Animated.View>
  );
}

function QuestionScreen<T extends string>(props: {
  title: string;
  helper?: string;
  options: Array<{ label: string; value: T; icon: ImageSourcePropType }>;
  selected: T | T[] | null;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.frequencyQuestion}>
      <View style={styles.frequencyHeader}>
        <Text style={styles.frequencyTitle}>{props.title}</Text>
        {props.helper ? <Text style={styles.frequencyHelper}>{props.helper}</Text> : null}
      </View>

      <View style={styles.frequencyOptionGrid}>
        {props.options.map((option) => {
          const selected = Array.isArray(props.selected)
            ? props.selected.includes(option.value)
            : props.selected === option.value;
          return (
            <View key={option.value} style={styles.frequencyOptionMotion}>
              <Pressable
                style={({ pressed }) => [
                  styles.frequencyOption,
                  selected ? styles.frequencyOptionSelected : null,
                  pressed ? styles.frequencyOptionPressed : null
                ]}
                onPress={() => props.onSelect(option.value)}
              >
                {selected ? <View pointerEvents="none" style={styles.frequencySelectedGlow} /> : null}
                <Image resizeMode="contain" source={option.icon} style={styles.frequencyOptionIcon} />
                <Text style={styles.frequencyOptionTitle}>{option.label}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function IdentityQuestion(props: {
  selected: BuilderIdentity | null;
  onSelect: (value: BuilderIdentity) => void;
}) {
  return (
    <View style={styles.frequencyQuestion}>
      <View style={styles.frequencyHeader}>
        <Text style={styles.frequencyTitle}>What best describes you?</Text>
        <Text style={styles.frequencyHelper}>Optional. Tap one or skip.</Text>
      </View>

      <View style={styles.frequencyOptionGrid}>
        {identityOptions.map((option) => {
          const selected = props.selected === option.value;
          return (
            <View key={option.value} style={styles.frequencyOptionMotion}>
              <Pressable
                style={({ pressed }) => [
                  styles.frequencyOption,
                  selected ? styles.frequencyOptionSelected : null,
                  pressed ? styles.frequencyOptionPressed : null
                ]}
                onPress={() => props.onSelect(option.value)}
              >
                {selected ? <View pointerEvents="none" style={styles.frequencySelectedGlow} /> : null}
                <Image resizeMode="contain" source={option.icon} style={styles.frequencyOptionIcon} />
                <Text style={styles.frequencyOptionTitle}>{option.label}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function UsageSlider(props: {
  title: string;
  selected: UsageDepth;
  onSelect: (value: UsageDepth) => void;
}) {
  const trackRef = useRef<View>(null);
  const [trackWidth, setTrackWidth] = useState(1);
  const [trackX, setTrackX] = useState(0);
  const selectedIndex = Math.max(0, depthOptions.findIndex((option) => option.value === props.selected));

  const updateFromPageX = (pageX: number) => {
    const clamped = Math.max(0, Math.min(trackWidth, pageX - trackX));
    const index = Math.round((clamped / trackWidth) * (depthOptions.length - 1));
    props.onSelect(depthOptions[index].value);
  };

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => updateFromPageX(event.nativeEvent.pageX),
    onPanResponderMove: (event) => updateFromPageX(event.nativeEvent.pageX)
  }), [trackWidth, trackX, props]);

  const onTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(Math.max(1, event.nativeEvent.layout.width));
    requestAnimationFrame(() => {
      trackRef.current?.measureInWindow((x) => setTrackX(x));
    });
  };

  return (
    <View style={styles.frequencyQuestion}>
      <View style={styles.frequencyHeader}>
        <Text style={styles.frequencyTitle}>{props.title}</Text>
      </View>

      <View style={styles.sliderOptions}>
        {depthOptions.map((option) => {
          const active = props.selected === option.value;
          return (
            <Pressable
              key={option.value}
              style={({ pressed }) => [
                styles.sliderOption,
                active ? styles.sliderOptionActive : null,
                pressed ? styles.sliderOptionPressed : null
              ]}
              onPress={() => props.onSelect(option.value)}
            >
              <Image resizeMode="contain" source={option.icon} style={[styles.sliderIcon, active ? styles.sliderIconActive : null]} />
              <Text style={[styles.sliderOptionText, active ? styles.sliderOptionTextActive : null]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View ref={trackRef} style={styles.sliderTrackWrap} onLayout={onTrackLayout} {...panResponder.panHandlers}>
        <View style={styles.sliderTrack} />
        <View style={[styles.sliderFill, { width: `${(selectedIndex / (depthOptions.length - 1)) * 100}%` }]} />
        {depthOptions.map((option, index) => {
          const active = index <= selectedIndex;
          return (
            <Pressable
              key={option.value}
              style={[styles.sliderStop, { left: `${(index / (depthOptions.length - 1)) * 100}%` }]}
              onPress={() => props.onSelect(option.value)}
            >
              <View style={[styles.sliderDot, active ? styles.sliderDotActive : null]} />
            </Pressable>
          );
        })}
        <View style={[styles.sliderThumb, { left: `${(selectedIndex / (depthOptions.length - 1)) * 100}%` }]} />
      </View>
    </View>
  );
}

function ProfileGeneratingScreen() {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0.08)).current;
  const statusOpacity = useRef(new Animated.Value(1)).current;
  const dotOne = useRef(new Animated.Value(0)).current;
  const dotTwo = useRef(new Animated.Value(0)).current;
  const dotThree = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<"analyzing" | "generating">("analyzing");

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        })
      ])
    );
    const rotateLoop = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 12000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    const dotLoop = Animated.loop(
      Animated.stagger(150, [dotOne, dotTwo, dotThree].map((dot) => (
        Animated.sequence([
          Animated.timing(dot, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 520,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true
          })
        ])
      )))
    );
    const progressAnimation = Animated.timing(progress, {
      toValue: 0.68,
      duration: 1850,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    });
    const statusTimer = setTimeout(() => {
      Animated.timing(statusOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start(({ finished }) => {
        if (!finished) return;
        setPhase("generating");
        Animated.timing(statusOpacity, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }).start();
      });
    }, 960);

    pulseLoop.start();
    rotateLoop.start();
    dotLoop.start();
    progressAnimation.start();

    return () => {
      clearTimeout(statusTimer);
      pulseLoop.stop();
      rotateLoop.stop();
      dotLoop.stop();
    };
  }, [dotOne, dotThree, dotTwo, progress, pulse, rotate, statusOpacity]);

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1.045] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.42, 0.74] });
  const rotateZ = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const progressDot = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const dots = [dotOne, dotTwo, dotThree];
  const title = phase === "analyzing" ? "Analyzing your answers..." : "Generating your builder profile...";
  const subtitle = phase === "analyzing"
    ? "Understanding your workflow and how you like to build."
    : "Tailoring the best coding experience for you.";

  return (
    <View style={[styles.generatingScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.generatingContent}>
        <View style={styles.generatingVisual}>
          <Animated.View style={[styles.generatingOuterGlow, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
          <View style={styles.generatingOrbitGhost} />
          <Animated.View style={[styles.generatingOrbitRing, { transform: [{ rotate: rotateZ }] }]}>
            <View style={[styles.generatingOrbitDot, styles.generatingOrbitDotMagenta]} />
            <View style={[styles.generatingOrbitDot, styles.generatingOrbitDotCyan]} />
            <View style={[styles.generatingOrbitDot, styles.generatingOrbitDotPurple]} />
          </Animated.View>
          <View style={styles.generatingInnerRing} />
          <LinearGradient
            colors={["rgba(214, 132, 255, 0.95)", "rgba(108, 37, 222, 0.96)", "rgba(35, 13, 86, 0.98)"]}
            start={{ x: 0.18, y: 0.12 }}
            end={{ x: 0.88, y: 0.9 }}
            style={styles.generatingCore}
          >
            <View style={styles.generatingCoreShade} />
            <View style={styles.generatingCoreGlass} />
            <View style={styles.generatingDots}>
              {dots.map((dot, index) => {
                const opacity = dot.interpolate({ inputRange: [0, 1], outputRange: [0.42, 1] });
                const translateY = dot.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });

                return (
                  <Animated.View
                    key={index}
                    style={[styles.generatingDot, { opacity, transform: [{ translateY }] }]}
                  />
                );
              })}
            </View>
          </LinearGradient>
        </View>

        <Animated.View style={[styles.generatingStatusWrap, { opacity: statusOpacity }]}>
          <Text style={styles.generatingStatus}>{title}</Text>
          <Text style={styles.generatingSubtitle}>{subtitle}</Text>
        </Animated.View>

        <View style={styles.generatingTrack}>
          <Animated.View style={[styles.generatingTrackFill, { width: progressWidth }]}>
            <LinearGradient
              colors={["#5B22D6", "#9E36FF", "#D978FF"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.generatingTrackFillGradient}
            />
          </Animated.View>
          <Animated.View style={[styles.generatingTrackDotWrap, { left: progressDot }]}>
            <View style={styles.generatingTrackDot} />
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

function InsightScreen({ personaId, persona }: { personaId: Persona; persona: PersonaModel }) {
  const insight = personaInsights[personaId];
  const nameParts = persona.name.split(" ");
  const titleLead = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "";
  const titleAccent = nameParts[nameParts.length - 1] ?? persona.name;
  const cardEntrances = useMemo(
    () => insight.bullets.map(() => new Animated.Value(0)),
    [insight.bullets]
  );

  useEffect(() => {
    cardEntrances.forEach((entrance) => entrance.setValue(0));

    Animated.stagger(
      145,
      cardEntrances.map((entrance) =>
        Animated.spring(entrance, {
          toValue: 1,
          damping: 18,
          mass: 0.82,
          stiffness: 118,
          useNativeDriver: true
        })
      )
    ).start();
  }, [cardEntrances, personaId]);

  return (
    <View style={styles.resultContent}>
      <View style={styles.personaHero}>
        <View pointerEvents="none" style={styles.personaHeroOrbit} />
        <View pointerEvents="none" style={styles.personaHeroGlow} />
        <Image resizeMode="contain" source={persona.icon} style={styles.personaIcon} />
      </View>

      <View style={styles.resultTitleBlock}>
        <Text style={styles.resultTitlePrimary}>
          You're a{titleLead ? ` ${titleLead}` : ""}
        </Text>
        <MaskedView
          style={styles.resultTitleGradientMask}
          maskElement={<Text style={styles.resultTitleGradientText}>{titleAccent}</Text>}
        >
          <LinearGradient
            colors={["#7C45FF", "#C849FF", "#FF5EBA", "#FFB45F"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.resultTitleGradientFill}
          />
        </MaskedView>
      </View>

      <Text style={styles.insightSubtitle}>What you could build:</Text>

      <View style={styles.insightStack}>
        {insight.bullets.map((bullet, index) => {
          const accent = resultBulletAccents[index % resultBulletAccents.length];
          const entrance = cardEntrances[index];
          const opacity = entrance.interpolate({
            inputRange: [0, 0.45, 1],
            outputRange: [0, 0.9, 1]
          });
          const translateY = entrance.interpolate({
            inputRange: [0, 1],
            outputRange: [34, 0]
          });
          const scale = entrance.interpolate({
            inputRange: [0, 1],
            outputRange: [0.94, 1]
          });

          return (
            <Animated.View key={bullet.text} style={[styles.insightRow, { opacity, transform: [{ translateY }, { scale }] }]}>
              <LinearGradient
                colors={["rgba(255, 255, 255, 0.09)", "rgba(137, 76, 255, 0.1)", "rgba(255, 255, 255, 0.035)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.insightRowFill}
              >
                <View pointerEvents="none" style={styles.insightRowGlow} />
                <View style={[styles.insightIcon, { backgroundColor: accent.glow, borderColor: accent.border, shadowColor: accent.color }]}>
                  <Ionicons name={bullet.icon} color={accent.color} size={26} />
                </View>
                <Text style={styles.insightText}>{bullet.text}</Text>
                <Ionicons name="chevron-forward" color="#C8AFFF" size={27} style={styles.insightChevron} />
              </LinearGradient>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

function PricingScreen({ persona, onClose }: { persona: PersonaModel; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const app = useAppContext();
  const [selectedPlan, setSelectedPlan] = useState<Plan>(persona.recommendedPlan);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("annual");
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const [purchasingProductId, setPurchasingProductId] = useState<string | null>(null);
  const auraMotion = useRef(new Animated.Value(getPlanMotionValue(persona.recommendedPlan))).current;
  const cardSwipeX = useRef(new Animated.Value(0)).current;
  const selected = plans.find((plan) => plan.name === selectedPlan) ?? plans[0];
  const selectedPlanIndex = Math.max(plans.findIndex((plan) => plan.name === selected.name), 0);
  const selectedProductId = membershipProductIds[selected.name][billingPeriod];
  const theme = getPlanTheme(selected.name);
  const billingLabel = billingPeriod === "monthly" ? "Monthly" : "Annual";
  const {
    connected: storeConnected,
    subscriptions,
    fetchProducts,
    finishTransaction,
    requestPurchase
  } = useIAP({
    onPurchaseSuccess: async (purchase: Purchase) => {
      try {
        await finishTransaction({ purchase, isConsumable: false });
        setPurchaseError("");
        setPurchaseMessage("Membership active. Taking you to connect your PC...");
        app.completeOnboarding();
        setTimeout(onClose, 650);
      } catch {
        setPurchaseError("Payment completed, but we could not finish the store transaction. Please restore purchases or contact support.");
      } finally {
        setPurchasingProductId(null);
      }
    },
    onPurchaseError: (error) => {
      setPurchasingProductId(null);
      setPurchaseMessage("");
      setPurchaseError(error.message || "Purchase could not be completed.");
    },
    onError: (error) => {
      setPurchaseError(error.message || "The store is not available right now.");
    }
  });
  const selectedStoreProduct = subscriptions.find((subscription) => subscription.id === selectedProductId);
  const selectedPrice = selectedStoreProduct?.displayPrice ?? (billingPeriod === "monthly" ? selected.monthlyPrice : selected.yearlyPrice);
  const isPurchasing = purchasingProductId === selectedProductId;

  useEffect(() => {
    Animated.timing(auraMotion, {
      toValue: getPlanMotionValue(selectedPlan),
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [auraMotion, selectedPlan]);

  useEffect(() => {
    if (!storeConnected) return;

    fetchProducts({ skus: membershipSkus, type: "subs" }).catch(() => {
      setPurchaseError("Memberships are not available yet. Try a development build with store products configured.");
    });
  }, [fetchProducts, storeConnected]);

  const auraOneTranslateX = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [-24, 0, 26] });
  const auraOneTranslateY = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [18, 0, -14] });
  const auraOneScale = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [0.9, 1.08, 1.18] });
  const auraTwoTranslateX = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [28, 0, -30] });
  const auraTwoTranslateY = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [-16, 0, 20] });
  const auraTwoScale = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [1.12, 1, 0.92] });
  const cardRotate = cardSwipeX.interpolate({ inputRange: [-220, 0, 220], outputRange: ["-2.5deg", "0deg", "2.5deg"], extrapolate: "clamp" });
  const cardOpacity = cardSwipeX.interpolate({ inputRange: [-260, 0, 260], outputRange: [0.7, 1, 0.7], extrapolate: "clamp" });
  const contentPaddingTop = Math.max(insets.top + 12, 34);
  const footerPaddingBottom = Math.max(insets.bottom + 8, 14);

  const settleCard = () => {
    Animated.spring(cardSwipeX, {
      toValue: 0,
      damping: 22,
      mass: 0.8,
      stiffness: 210,
      useNativeDriver: true
    }).start();
  };

  const switchPlanBySwipe = (direction: 1 | -1) => {
    const nextIndex = selectedPlanIndex + direction;

    if (nextIndex < 0 || nextIndex >= plans.length) {
      settleCard();
      return;
    }

    Animated.timing(cardSwipeX, {
      toValue: direction === 1 ? -420 : 420,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start(() => {
      setSelectedPlan(plans[nextIndex].name);
      cardSwipeX.setValue(direction === 1 ? 420 : -420);
      Animated.spring(cardSwipeX, {
        toValue: 0,
        damping: 24,
        mass: 0.85,
        stiffness: 190,
        useNativeDriver: true
      }).start();
    });
  };

  const cardPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
    onPanResponderMove: (_event, gesture) => {
      const boundedX = Math.max(Math.min(gesture.dx, 140), -140);
      cardSwipeX.setValue(boundedX);
    },
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) < 58 && Math.abs(gesture.vx) < 0.45) {
        settleCard();
        return;
      }

      switchPlanBySwipe(gesture.dx < 0 ? 1 : -1);
    },
    onPanResponderTerminate: settleCard
  }), [cardSwipeX, selectedPlanIndex]);

  const buyMembership = async () => {
    setPurchaseError("");
    setPurchaseMessage("");

    if (!storeConnected) {
      setPurchaseError("In-app purchases need a development or store build. They will not open inside Expo Go.");
      return;
    }

    try {
      setPurchasingProductId(selectedProductId);
      const androidOfferToken = Platform.OS === "android"
        ? selectedStoreProduct?.subscriptionOffers?.[0]?.offerTokenAndroid
        : undefined;

      await requestPurchase({
        type: "subs",
        request: {
          apple: { sku: selectedProductId },
          google: {
            skus: [selectedProductId],
            subscriptionOffers: androidOfferToken ? [{ sku: selectedProductId, offerToken: androidOfferToken }] : undefined
          }
        }
      });
    } catch (error) {
      setPurchasingProductId(null);
      setPurchaseError(error instanceof Error ? error.message : "Purchase could not be started.");
    }
  };

  return (
    <View style={styles.paywallShell}>
      <LinearGradient
        colors={theme.background}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.paywallBackground}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.paywallAuraOne,
          { transform: [{ translateX: auraOneTranslateX }, { translateY: auraOneTranslateY }, { scale: auraOneScale }] }
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.paywallAuraTwo,
          { transform: [{ translateX: auraTwoTranslateX }, { translateY: auraTwoTranslateY }, { scale: auraTwoScale }] }
        ]}
      />
      <View pointerEvents="none" style={styles.paywallNoise} />
      <ScrollView
        contentContainerStyle={[
          styles.paywallContent,
          { paddingBottom: footerPaddingBottom + 96, paddingTop: contentPaddingTop }
        ]}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.paywallClose} onPress={onClose}>
          <Ionicons name="close" color={colors.text} size={32} />
        </Pressable>

        <View style={styles.paywallHero}>
          <Text style={styles.paywallTitle}>Upgrade and get</Text>
          <Text style={[styles.paywallTitle, { color: theme.accent }]}>more credits</Text>
        </View>

        <View style={styles.paywallTabs}>
          {plans.map((plan) => {
            const planTheme = getPlanTheme(plan.name);
            const active = plan.name === selected.name;

            return (
              <Pressable
                key={plan.name}
                style={[styles.paywallTab, active ? styles.paywallTabActive : null]}
                onPress={() => setSelectedPlan(plan.name)}
              >
                <Text style={[styles.paywallTabText, active ? { color: planTheme.accent } : null]}>
                  {plan.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.billingTabs}>
          {(["monthly", "annual"] as BillingPeriod[]).map((period) => {
            const active = billingPeriod === period;
            return (
              <Pressable
                key={period}
                style={[styles.billingTab, active ? styles.billingTabActive : null]}
                onPress={() => setBillingPeriod(period)}
              >
                <Text style={[styles.billingTabText, active ? { color: theme.accent } : null]}>
                  {period === "monthly" ? "Monthly" : "Annual"}
                </Text>
                {period === "annual" ? <Text style={styles.billingSave}>{selected.yearlySaving}</Text> : null}
              </Pressable>
            );
          })}
        </View>

        <Animated.View
          {...cardPanResponder.panHandlers}
          style={[
            styles.paywallCard,
            {
              opacity: cardOpacity,
              transform: [{ translateX: cardSwipeX }, { rotate: cardRotate }]
            }
          ]}
        >
          <View style={styles.paywallCardHeader}>
            <View>
              <Text style={[styles.paywallPlanName, { color: theme.accent }]}>{selected.name}</Text>
              <Text style={styles.paywallPlanPrice}>{selectedPrice}</Text>
              <Text style={styles.paywallYearly}>
                {billingPeriod === "monthly" ? `${selected.yearlyPrice} · ${selected.yearlySaving}` : "Best value for committed builders"}
              </Text>
            </View>
            {selected.name === persona.recommendedPlan || selected.name === "Builder" ? (
              <View style={[styles.paywallBadge, { backgroundColor: theme.accent }]}>
                <Text style={styles.paywallBadgeText}>{selected.name === "Builder" ? "Most Popular" : "Recommended"}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.paywallDivider} />

          <View style={styles.paywallFeatureStack}>
            {selected.features.map((feature) => (
              <View key={feature} style={styles.paywallFeatureRow}>
                <Ionicons name="checkmark" color={theme.accent} size={28} />
                <Text style={styles.paywallFeatureText}>{feature}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      <View style={[styles.paywallFooter, { paddingBottom: footerPaddingBottom }]}>
        <Pressable
          disabled={isPurchasing}
          style={({ pressed }) => [styles.paywallCtaWrap, pressed && !isPurchasing ? styles.planCtaPressed : null, isPurchasing ? styles.paywallCtaDisabled : null]}
          onPress={buyMembership}
        >
          <LinearGradient
            colors={theme.button}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.paywallCta}
          >
            <Text style={styles.paywallCtaText}>
              {isPurchasing ? "Opening secure checkout..." : `Upgrade to ${selected.name} ${billingLabel}`}
            </Text>
          </LinearGradient>
        </Pressable>
        {purchaseError ? <Text style={styles.paywallErrorText}>{purchaseError}</Text> : null}
        {purchaseMessage ? <Text style={styles.paywallSuccessText}>{purchaseMessage}</Text> : null}
        <Text style={styles.paywallFooterText}>
          Subscribe for {selectedPrice}. Cancel anytime
        </Text>
      </View>
    </View>
  );
}

function getPlanTheme(plan: Plan): {
  accent: string;
  background: [string, string, string];
  button: [string, string];
} {
  if (plan === "Starter") {
    return {
      accent: "#23B982",
      background: ["#07070A", "#102019", "#1A1034"],
      button: ["#1FAE78", colors.accent]
    };
  }

  if (plan === "Pro") {
    return {
      accent: colors.magenta,
      background: ["#07070A", "#2B0D28", "#2A1708"],
      button: [colors.magenta, colors.amber]
    };
  }

  return {
    accent: colors.accent,
    background: ["#07070A", "#160D2A", "#2A1030"],
    button: [colors.accent, "#9254FF"]
  };
}

function getPlanMotionValue(plan: Plan) {
  if (plan === "Starter") return 0;
  if (plan === "Pro") return 2;
  return 1;
}

function ProgressIndicator({ step, style, total }: { step: number; style?: object; total: number }) {
  const progress = `${(step / total) * 100}%` as `${number}%`;

  return (
    <View style={[styles.progressWrap, style]}>
      <View style={styles.progressRail}>
        <LinearGradient
          colors={[colors.accent, colors.magenta, colors.amber]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: progress }]}
        />
      </View>
    </View>
  );
}

function SetupScreen() {
  const app = useAppContext();
  const insets = useSafeAreaInsets();
  const [connectStep, setConnectStep] = useState<1 | 2 | 3 | 4>(1);
  const [connectMode, setConnectMode] = useState<"auto" | "manual">("auto");
  const [guideVisible, setGuideVisible] = useState(false);
  const [foundDesktops, setFoundDesktops] = useState<RememberedDesktop[]>(app.rememberedDesktops);
  const autoFindStartedRef = useRef(false);
  const ambientGlow = useRef(new Animated.Value(0)).current;
  const panelOpacity = useRef(new Animated.Value(1)).current;
  const panelTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (app.pendingPhoneApproval) {
      setConnectStep(3);
    }
  }, [app.pendingPhoneApproval]);

  useEffect(() => {
    if (app.rememberedDesktops.length > 0) setFoundDesktops(app.rememberedDesktops);
  }, [app.rememberedDesktops]);

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ambientGlow, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(ambientGlow, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true
        })
      ])
    );

    glowLoop.start();
    return () => glowLoop.stop();
  }, [ambientGlow]);

  useEffect(() => {
    panelOpacity.setValue(0);
    panelTranslateY.setValue(12);
    Animated.parallel([
      Animated.timing(panelOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(panelTranslateY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]).start();
  }, [connectMode, connectStep, panelOpacity, panelTranslateY]);

  const confirmConnection = () => {
    setConnectStep(4);
    setTimeout(() => app.confirmPhonePermission(), 900);
  };

  const findDesktops = useCallback(async () => {
    if (app.checkingHealth) return;
    setFoundDesktops([]);
    const results = await app.discoverPairableDesktops();
    setFoundDesktops(results);
  }, [app]);

  useEffect(() => {
    if (connectStep !== 2 || connectMode !== "auto" || autoFindStartedRef.current) return;
    autoFindStartedRef.current = true;
    void findDesktops();
  }, [connectMode, connectStep, findDesktops]);

  const logoTranslateY = ambientGlow.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.connectScreen}>
      <Image source={connectBackdrop} resizeMode="cover" style={styles.connectBackdropImage} />
      <ScrollView
        contentContainerStyle={[
          styles.connectScrollContent,
          {
            paddingBottom: Math.max(insets.bottom + 14, 22),
            paddingTop: Math.max(insets.top + 8, 18)
          }
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.connectHeader}>
          <Animated.View style={[styles.connectLogoWrap, { transform: [{ translateY: logoTranslateY }] }]}>
            <VibyraLogo style={styles.connectLogo} />
          </Animated.View>
          <Text style={styles.connectTitle}>
            <Text style={styles.connectTitleAccent}>Connect</Text> to your PC
          </Text>
          <Text style={styles.connectSubtitle}>One clear step at a time. Keep both devices on the same Wi-Fi.</Text>
        </View>

        <View style={styles.connectStepDots}>
          {[1, 2, 3, 4].map((step, index) => (
            <React.Fragment key={step}>
              <View style={[styles.connectStepDot, step <= connectStep ? styles.connectStepDotActive : null]}>
                <Text style={[styles.connectStepDotText, step <= connectStep ? styles.connectStepDotTextActive : null]}>{step}</Text>
              </View>
              {index < 3 ? <View style={[styles.connectStepRail, step < connectStep ? styles.connectStepRailActive : null]} /> : null}
            </React.Fragment>
          ))}
        </View>

        <Animated.View style={[styles.connectActivePanel, { opacity: panelOpacity, transform: [{ translateY: panelTranslateY }] }]}>
          {connectStep === 1 ? (
          <ConnectStep
            number={1}
            icon="download-outline"
            title="Download Vibyra Desktop"
            lines={["Download Vibyra Desktop at vibyra.ai.", "Available for Windows, Mac, and Linux."]}
          >
            <Pressable style={({ pressed }) => [styles.connectPrimaryAction, pressed ? styles.connectActionPressed : null]} onPress={() => setConnectStep(2)}>
              <LinearGradient
                colors={["#762CFF", "#9D35FF", "#B13CFF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.connectPrimaryActionGradient}
              >
                <Ionicons name="checkmark-circle-outline" color={colors.text} size={31} />
                <Text style={styles.connectPrimaryActionText}>I downloaded Vibyra Desktop</Text>
              </LinearGradient>
            </Pressable>
          </ConnectStep>
          ) : null}

          {connectStep === 2 ? (
          <ConnectStep number={2} icon="phone-portrait-outline" title="Choose how to connect">
            <View style={styles.connectActionStack}>
              <View style={styles.connectModeTabs}>
                <Pressable style={[styles.connectModeTab, connectMode === "auto" ? styles.connectModeTabActive : null]} onPress={() => setConnectMode("auto")}>
                  <Ionicons name="wifi-outline" color={connectMode === "auto" ? colors.text : colors.muted} size={15} />
                  <Text style={[styles.connectModeText, connectMode === "auto" ? styles.connectModeTextActive : null]}>Auto Find</Text>
                </Pressable>
                <Pressable style={[styles.connectModeTab, connectMode === "manual" ? styles.connectModeTabActive : null]} onPress={() => setConnectMode("manual")}>
                  <Ionicons name="keypad-outline" color={connectMode === "manual" ? colors.text : colors.muted} size={15} />
                  <Text style={[styles.connectModeText, connectMode === "manual" ? styles.connectModeTextActive : null]}>Manual</Text>
                </Pressable>
              </View>

              {connectMode === "auto" ? (
                <View style={styles.connectSimplePane}>
                  <Pressable
                    disabled={app.checkingHealth}
                    style={({ pressed }) => [styles.connectPrimaryAction, pressed && !app.checkingHealth ? styles.connectActionPressed : null, app.checkingHealth ? styles.connectActionDisabled : null]}
                    onPress={findDesktops}
                  >
                    <LinearGradient
                      colors={["#762CFF", "#9D35FF", "#B13CFF"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.connectPrimaryActionGradient}
                    >
                      <Ionicons name="search-outline" color={colors.text} size={27} />
                      <View style={styles.connectActionCopy}>
                        <Text style={styles.connectActionTitle}>{app.checkingHealth ? "Searching nearby PCs..." : foundDesktops.length > 0 ? "Search again" : "Auto Find My PC"}</Text>
                        <Text style={styles.connectActionMeta}>Starts automatically on same Wi-Fi.</Text>
                      </View>
                    </LinearGradient>
                  </Pressable>

                  {foundDesktops.length > 0 ? (
                    <View style={styles.desktopList}>
                      {foundDesktops.map((desktop) => (
                        <Pressable
                          key={desktop.url}
                          style={({ pressed }) => [styles.desktopResult, pressed ? styles.connectActionPressed : null]}
                          onPress={() => app.pairMachineAt(desktop.url, desktop.pairCode)}
                        >
                          <Ionicons name="desktop-outline" color="#8AF7FF" size={18} />
                          <View style={styles.connectActionCopy}>
                            <Text style={styles.desktopResultTitle}>{desktop.machineName}</Text>
                            <View style={styles.desktopResultMetaRow}>
                              <View style={[styles.desktopResultStatusDot, getOnboardingDesktopStatusStyle(desktop.status)]} />
                              <Text style={styles.desktopResultMeta}>{getOnboardingDesktopStatusLabel(desktop.status)}</Text>
                            </View>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={styles.connectSimplePane}>
                  <Text style={styles.connectCodeLabel}>Manual code</Text>
                  <TextInput
                    value={app.pairCode}
                    onChangeText={(value) => app.setPairCode(value.toUpperCase())}
                    placeholder="ABC123"
                    placeholderTextColor={colors.dim}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={6}
                    onSubmitEditing={app.pairMachine}
                    returnKeyType="done"
                    style={[styles.input, styles.connectCodeInput]}
                  />
                  <Text style={styles.connectOrText}>Use the 2 codes shown on phone and desktop</Text>
                  <Pressable style={({ pressed }) => [styles.connectSecondaryAction, pressed ? styles.connectActionPressed : null]} onPress={app.pairMachine}>
                    <Ionicons name="link-outline" color={colors.text} size={18} />
                    <Text style={styles.connectSecondaryActionText}>{app.pairing ? "Connecting..." : "Connect manually"}</Text>
                  </Pressable>
                </View>
              )}
              {app.pairing && !app.pendingPhoneApproval ? <WaitingApprovalIndicator message="Awaiting approval from PC application" /> : null}
              {app.healthMessage ? <Text style={styles.connectStatus}>{app.healthMessage}</Text> : null}
              {app.pairingError ? <Text style={styles.errorText}>{app.pairingError}</Text> : null}
            </View>
          </ConnectStep>
          ) : null}

          {connectStep === 3 ? (
          <ConnectStep
            number={3}
            icon="shield-checkmark-outline"
            title="Approve the connection"
            lines={["Tap Allow on your computer.", "Then confirm on your phone."]}
          >
            <Pressable style={({ pressed }) => [styles.connectPrimaryAction, pressed ? styles.connectActionPressed : null]} onPress={confirmConnection}>
              <LinearGradient
                colors={["#762CFF", "#9D35FF", "#B13CFF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.connectPrimaryActionGradient}
              >
                <Ionicons name="checkmark-circle-outline" color={colors.text} size={31} />
                <Text style={styles.connectPrimaryActionText}>Confirm on phone</Text>
              </LinearGradient>
            </Pressable>
          </ConnectStep>
          ) : null}

          {connectStep === 4 ? (
          <ConnectStep
            number={4}
            icon="sparkles-outline"
            title="You're connected"
            lines={["Start controlling your PC instantly."]}
          />
          ) : null}
        </Animated.View>
        <Pressable style={({ pressed }) => [styles.connectHelpRow, pressed ? styles.connectActionPressed : null]} onPress={() => setGuideVisible(true)}>
          <Ionicons name="shield-checkmark-outline" color="#9A4DFF" size={23} />
          <Text style={styles.connectHelpText}>Need help?</Text>
          <Text style={styles.connectGuideText}>View guide</Text>
          <Ionicons name="chevron-forward" color="#9A4DFF" size={19} />
        </Pressable>
      </ScrollView>
      <ConnectGuideModal visible={guideVisible} onClose={() => setGuideVisible(false)} />
    </KeyboardAvoidingView>
  );
}

function ConnectStep({
  children,
  icon,
  lines,
  number,
  title
}: {
  children?: React.ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  lines?: string[];
  number: number;
  title: string;
}) {
  return (
    <View style={styles.connectStep}>
      <View style={styles.connectStepTop}>
        <View style={styles.connectStepNumber}>
          <Text style={styles.connectStepNumberText}>{number}</Text>
        </View>
        <View style={styles.connectStepIcon}>
          <Ionicons name={icon} color="#8F32FF" size={27} />
        </View>
        <Text style={styles.connectStepTitle}>{title}</Text>
      </View>
      {lines?.map((line) => <Text key={line} style={styles.connectLine}>{line}</Text>)}
      {children}
    </View>
  );
}

const connectGuideSteps: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  kicker: string;
  title: string;
  lines: string[];
}> = [
  {
    icon: "desktop-outline",
    kicker: "Step 1",
    title: "💻 Set up Vibyra on your computer",
    lines: [
      "Download Vibyra Desktop for Windows, Mac, or Linux.",
      "Install and open the app.",
      "Keep Vibyra running. You will see a connection code or QR code."
    ]
  },
  {
    icon: "phone-portrait-outline",
    kicker: "Step 2",
    title: "📱 Open Vibyra on your phone",
    lines: [
      "Download and open the Vibyra mobile app.",
      "Tap \"Connect to a Computer\"."
    ]
  },
  {
    icon: "link-outline",
    kicker: "Step 3",
    title: "🔗 Connect your devices",
    lines: [
      "✨ Find My Computer automatically finds your computer on the same Wi-Fi.",
      "🔢 Use Code lets you enter the code shown on your computer."
    ]
  },
  {
    icon: "shield-checkmark-outline",
    kicker: "Step 4",
    title: "🔐 Approve the connection",
    lines: [
      "A prompt will appear on your computer.",
      "Tap \"Allow\" to confirm.",
      "Your phone will connect instantly."
    ]
  },
  {
    icon: "sparkles-outline",
    kicker: "Step 5",
    title: "🎉 You're connected!",
    lines: [
      "Control your computer.",
      "Use touch as a mouse.",
      "Type with your phone keyboard."
    ]
  }
];

const connectGuideTroubleshooting = [
  {
    title: "Can't find your computer?",
    lines: [
      "Make sure both devices are on the same Wi-Fi.",
      "Check that Vibyra is open on your computer."
    ]
  },
  {
    title: "Connecting from anywhere?",
    lines: ["Use \"Use Code\" instead of auto find."]
  }
];

const connectGuideTips = [
  "Your computer will be saved for next time → just tap to reconnect.",
  "Keep Vibyra running on your computer for quick access."
];

function ConnectGuideModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.connectGuideOverlay}>
        <Image source={connectBackdrop} resizeMode="cover" style={styles.connectBackdropImage} />
        <View style={styles.connectGuideScrim} />
        <ScrollView
          contentContainerStyle={[
            styles.connectGuideContent,
            {
              paddingBottom: Math.max(insets.bottom + 24, 36),
              paddingTop: Math.max(insets.top + 14, 28)
            }
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.connectGuideHero}>
            <Pressable style={({ pressed }) => [styles.connectGuideClose, pressed ? styles.connectActionPressed : null]} onPress={onClose}>
              <Ionicons name="close" color={colors.text} size={22} />
            </Pressable>
            <View style={styles.connectGuideHeroIcon}>
              <Ionicons name="rocket-outline" color="#C97BFF" size={28} />
            </View>
            <Text style={styles.connectGuideTitle}>🚀 Getting Started with Vibyra</Text>
            <Text style={styles.connectGuideIntro}>Follow these simple steps to connect your phone to your computer in seconds.</Text>
          </View>

          <View style={styles.connectGuideStepStack}>
            {connectGuideSteps.map((step) => (
              <View key={step.kicker} style={styles.connectGuideCard}>
                <LinearGradient
                  colors={["rgba(255, 255, 255, 0.08)", "rgba(113, 48, 255, 0.13)", "rgba(255, 255, 255, 0.035)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.connectGuideCardFill}
                >
                  <View style={styles.connectGuideCardTop}>
                    <View style={styles.connectGuideStepIcon}>
                      <Ionicons name={step.icon} color="#C97BFF" size={22} />
                    </View>
                    <View style={styles.connectGuideCardHeader}>
                      <Text style={styles.connectGuideKicker}>{step.kicker}</Text>
                      <Text style={styles.connectGuideSectionTitle}>{step.title}</Text>
                    </View>
                  </View>
                  <View style={styles.connectGuideBullets}>
                    {step.lines.map((line) => (
                      <View key={line} style={styles.connectGuideBulletRow}>
                        <View style={styles.connectGuideBulletDot} />
                        <Text style={styles.connectGuideBody}>{line}</Text>
                      </View>
                    ))}
                  </View>
                </LinearGradient>
              </View>
            ))}
          </View>

          <View style={styles.connectGuideInfoGrid}>
            <View style={styles.connectGuideInfoCard}>
              <Text style={styles.connectGuideInfoTitle}>❓ Troubleshooting</Text>
              {connectGuideTroubleshooting.map((item) => (
                <View key={item.title} style={styles.connectGuideInfoBlock}>
                  <Text style={styles.connectGuideQuestion}>{item.title}</Text>
                  {item.lines.map((line) => (
                    <Text key={line} style={styles.connectGuideSmallLine}>• {line}</Text>
                  ))}
                </View>
              ))}
            </View>

            <View style={styles.connectGuideInfoCard}>
              <Text style={styles.connectGuideInfoTitle}>💡 Tips</Text>
              {connectGuideTips.map((tip) => (
                <Text key={tip} style={styles.connectGuideSmallLine}>• {tip}</Text>
              ))}
            </View>
          </View>

          <LinearGradient
            colors={["#762CFF", "#B63AFF", "#FF8D72"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.connectGuideDone}
          >
            <Pressable style={({ pressed }) => [styles.connectGuideDonePressable, pressed ? styles.connectActionPressed : null]} onPress={onClose}>
              <Text style={styles.connectGuideDoneText}>Enjoy seamless control with Vibyra ✨</Text>
              <Ionicons name="arrow-forward" color={colors.text} size={22} />
            </Pressable>
          </LinearGradient>
        </ScrollView>
      </View>
    </Modal>
  );
}

function PairAction() {
  const app = useAppContext();
  if (!app.pendingPhoneApproval) {
    return (
      <Pressable style={({ pressed }) => [styles.connectSecondaryAction, pressed ? styles.connectActionPressed : null]} onPress={app.pairMachine}>
        <Ionicons name="link-outline" color={colors.text} size={18} />
        <Text style={styles.connectSecondaryActionText}>{app.pairing ? "Connecting..." : "Connect with code"}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.connectApproval}>
      <Ionicons name="shield-checkmark-outline" color={colors.success} size={22} />
      <Text style={styles.connectApprovalTitle}>Allow {app.pendingPhoneApproval.machineName}?</Text>
      <Text style={styles.rowMeta}>
        Vibyra can show projects, receive prompts, run approved commands, and send live updates.
      </Text>
      <PrimaryButton icon="checkmark-circle-outline" label="Confirm on phone" onPress={app.confirmPhonePermission} />
    </View>
  );
}

function WaitingApprovalIndicator({ message }: { message: string }) {
  const dotOne = useRef(new Animated.Value(0.35)).current;
  const dotTwo = useRef(new Animated.Value(0.35)).current;
  const dotThree = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.stagger(180, [dotOne, dotTwo, dotThree].map((dot) => (
        Animated.sequence([
          Animated.timing(dot, {
            toValue: 1,
            duration: 420,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true
          }),
          Animated.timing(dot, {
            toValue: 0.35,
            duration: 420,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true
          })
        ])
      )))
    );

    loop.start();
    return () => loop.stop();
  }, [dotOne, dotTwo, dotThree]);

  return (
    <View style={styles.connectWaiting}>
      <Text style={styles.connectWaitingTitle}>{message}</Text>
      <View style={styles.connectWaitingDots}>
        {[dotOne, dotTwo, dotThree].map((dot, index) => (
          <Animated.View key={index} style={[styles.connectWaitingDot, { opacity: dot, transform: [{ scale: dot }] }]} />
        ))}
      </View>
    </View>
  );
}

function PairCode({ code }: { code: string }) {
  return (
    <View style={styles.pairCodeRow}>
      {(code || "------").padEnd(6, "-").slice(0, 6).split("").map((char, index) => (
        <View key={`${char}-${index}`} style={styles.pairCodeCell}>
          <Text style={styles.pairCodeText}>{char === "-" ? "" : char}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    height: 48,
    paddingHorizontal: 4
  },
  backButtonArt: {
    gap: 8,
    height: 62
  },
  backIconArt: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 999,
    height: 56,
    justifyContent: "center",
    shadowColor: "#8158FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    width: 56
  },
  backText: { color: colors.muted, fontSize: 15, fontWeight: "700" },
  backTextArt: {
    color: "#D8CAFF",
    fontSize: 20,
    fontWeight: "900"
  },
  billingSave: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "900",
    marginTop: 0
  },
  billingTab: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    justifyContent: "center",
    minHeight: 34
  },
  billingTabActive: {
    backgroundColor: "rgba(109, 59, 255, 0.16)",
    borderColor: "rgba(139, 92, 255, 0.34)",
    borderWidth: 1
  },
  billingTabs: {
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    marginTop: 6,
    padding: 3,
    width: "72%"
  },
  billingTabText: {
    color: "rgba(255, 255, 255, 0.58)",
    fontSize: 12,
    fontWeight: "900"
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden"
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject
  },
  backdropBand: {
    borderRadius: 999,
    height: 190,
    position: "absolute"
  },
  backdropBandBottom: {
    bottom: 70,
    left: -100,
    right: -70,
    transform: [{ rotate: "-14deg" }]
  },
  backdropBandTop: {
    left: -80,
    right: -120,
    top: 64,
    transform: [{ rotate: "12deg" }]
  },
  backdropGrid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7, 7, 10, 0.38)"
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  badgeText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  codeHalo: {
    alignItems: "center",
    backgroundColor: colors.magentaSoft,
    borderColor: colors.magenta,
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  codeLabel: { color: colors.magenta, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  connectActionCopy: {
    flex: 1,
    minWidth: 0
  },
  connectActionMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 3
  },
  connectActionPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }]
  },
  connectActionDisabled: {
    opacity: 0.7
  },
  connectActionStack: {
    gap: 10,
    marginTop: 12
  },
  connectActionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  connectApproval: {
    alignItems: "center",
    backgroundColor: colors.successSoft,
    borderColor: "rgba(55, 214, 122, 0.38)",
    borderRadius: 12,
    borderWidth: 1,
    gap: 9,
    marginTop: 8,
    padding: 12
  },
  connectApprovalTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center"
  },
  connectCodeBlock: {
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 12,
    borderWidth: 1,
    padding: 10
  },
  connectCodeInput: {
    backgroundColor: "rgba(5, 4, 20, 0.74)",
    borderColor: "rgba(147, 57, 255, 0.46)",
    borderRadius: 16,
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 5,
    minHeight: 54,
    textAlign: "center",
    textTransform: "uppercase"
  },
  connectCodeLabel: {
    color: "#A94BFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    marginLeft: 2,
    textTransform: "uppercase"
  },
  connectContent: {
    padding: 20,
    paddingBottom: 34
  },
  connectHeader: {
    alignItems: "center",
    paddingHorizontal: 4
  },
  connectGuideText: {
    color: "#9A4DFF",
    fontSize: 15,
    fontWeight: "900"
  },
  connectGuideBody: {
    color: "rgba(232, 226, 255, 0.82)",
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  connectGuideBulletDot: {
    backgroundColor: "#B96DFF",
    borderRadius: 999,
    height: 6,
    marginTop: 7,
    shadowColor: "#B96DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    width: 6
  },
  connectGuideBulletRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  connectGuideBullets: {
    gap: 8,
    marginTop: 14
  },
  connectGuideCard: {
    borderColor: "rgba(174, 98, 255, 0.34)",
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#8E35FF",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 22
  },
  connectGuideCardFill: {
    paddingHorizontal: 16,
    paddingVertical: 16
  },
  connectGuideCardHeader: {
    flex: 1,
    minWidth: 0
  },
  connectGuideCardTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  connectGuideClose: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.09)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    position: "absolute",
    right: 14,
    top: 14,
    width: 42,
    zIndex: 2
  },
  connectGuideContent: {
    gap: 14,
    paddingHorizontal: 18
  },
  connectGuideDone: {
    borderColor: "rgba(255, 255, 255, 0.24)",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#B63AFF",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.42,
    shadowRadius: 24
  },
  connectGuideDonePressable: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 16
  },
  connectGuideDoneText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
    textAlign: "center"
  },
  connectGuideHero: {
    alignItems: "center",
    backgroundColor: "rgba(6, 5, 22, 0.72)",
    borderColor: "rgba(174, 98, 255, 0.42)",
    borderRadius: 26,
    borderWidth: 1.5,
    overflow: "hidden",
    paddingBottom: 22,
    paddingHorizontal: 18,
    paddingTop: 26,
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 28
  },
  connectGuideHeroIcon: {
    alignItems: "center",
    backgroundColor: "rgba(149, 60, 255, 0.2)",
    borderColor: "rgba(201, 123, 255, 0.42)",
    borderRadius: 18,
    borderWidth: 1,
    height: 58,
    justifyContent: "center",
    shadowColor: "#C97BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.58,
    shadowRadius: 18,
    width: 58
  },
  connectGuideInfoBlock: {
    gap: 5,
    marginTop: 12
  },
  connectGuideInfoCard: {
    backgroundColor: "rgba(6, 5, 22, 0.7)",
    borderColor: "rgba(174, 98, 255, 0.26)",
    borderRadius: 20,
    borderWidth: 1,
    padding: 16
  },
  connectGuideInfoGrid: {
    gap: 12
  },
  connectGuideInfoTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22
  },
  connectGuideIntro: {
    color: "rgba(226, 219, 255, 0.78)",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 310,
    textAlign: "center"
  },
  connectGuideKicker: {
    color: "#C97BFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 3,
    textTransform: "uppercase"
  },
  connectGuideOverlay: {
    backgroundColor: colors.background,
    flex: 1,
    overflow: "hidden"
  },
  connectGuideQuestion: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19
  },
  connectGuideScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 1, 12, 0.32)"
  },
  connectGuideSectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22
  },
  connectGuideSmallLine: {
    color: "rgba(232, 226, 255, 0.8)",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 5
  },
  connectGuideStepIcon: {
    alignItems: "center",
    backgroundColor: "rgba(149, 60, 255, 0.18)",
    borderColor: "rgba(201, 123, 255, 0.34)",
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    shadowColor: "#C97BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    width: 44
  },
  connectGuideStepStack: {
    gap: 12
  },
  connectGuideTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 32,
    marginTop: 16,
    maxWidth: 310,
    textAlign: "center"
  },
  connectHelpRow: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 28,
    paddingHorizontal: 14
  },
  connectHelpText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  },
  connectLine: {
    color: "rgba(227, 222, 255, 0.78)",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 3
  },
  connectLogo: {
    height: 116,
    width: 160
  },
  connectLogoWrap: {
    marginBottom: 4,
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.35,
    shadowRadius: 30
  },
  connectModeTab: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 999,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 36
  },
  connectModeTabActive: {
    backgroundColor: "rgba(148, 65, 255, 0.24)"
  },
  connectModeTabs: {
    backgroundColor: "rgba(11, 8, 32, 0.74)",
    borderColor: "rgba(154, 77, 255, 0.22)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    padding: 4
  },
  connectModeText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  connectModeTextActive: {
    color: colors.text
  },
  connectOrText: {
    color: colors.dim,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 2,
    textAlign: "center",
    textTransform: "none"
  },
  connectPrimaryAction: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 58,
    overflow: "hidden",
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.42,
    shadowRadius: 18
  },
  connectPrimaryActionGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 11,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: "100%"
  },
  connectPrimaryActionText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
    textAlign: "center"
  },
  connectBackdropImage: {
    ...StyleSheet.absoluteFillObject
  },
  connectScreen: {
    flex: 1,
    overflow: "hidden"
  },
  connectScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22
  },
  connectSecondaryAction: {
    alignItems: "center",
    backgroundColor: "rgba(15, 10, 42, 0.82)",
    borderColor: "rgba(154, 77, 255, 0.26)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14
  },
  connectSecondaryActionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  connectStatus: {
    color: "#C371FF",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    textAlign: "center"
  },
  connectWaiting: {
    alignItems: "center",
    gap: 10,
    marginTop: 6
  },
  connectWaitingDot: {
    backgroundColor: "#D07CFF",
    borderRadius: 999,
    height: 10,
    shadowColor: "#D07CFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    width: 10
  },
  connectWaitingDots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center"
  },
  connectWaitingTitle: {
    color: "#E6C8FF",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
    textAlign: "center"
  },
  connectActivePanel: {
    alignSelf: "center",
    maxWidth: 430,
    width: "100%"
  },
  connectStep: {
    backgroundColor: "rgba(6, 5, 22, 0.72)",
    borderColor: "rgba(151, 54, 255, 0.54)",
    borderRadius: 24,
    borderWidth: 1.5,
    paddingBottom: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    shadowColor: "#9A35FF",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.32,
    shadowRadius: 24
  },
  connectStepDot: {
    alignItems: "center",
    backgroundColor: "rgba(16, 14, 34, 0.88)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 999,
    borderWidth: 2,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  connectStepDotActive: {
    backgroundColor: "#8F32FF",
    borderColor: "rgba(176, 95, 255, 0.92)",
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.78,
    shadowRadius: 15
  },
  connectStepDots: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 14,
    marginTop: 18
  },
  connectStepDotText: {
    color: "rgba(255, 255, 255, 0.48)",
    fontSize: 15,
    fontWeight: "900"
  },
  connectStepDotTextActive: {
    color: colors.text
  },
  connectStepIcon: {
    alignItems: "center",
    backgroundColor: "rgba(80, 34, 160, 0.28)",
    borderColor: "rgba(154, 77, 255, 0.28)",
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    shadowColor: "#8A35FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.26,
    shadowRadius: 18,
    width: 48
  },
  connectStepNumber: {
    alignItems: "center",
    backgroundColor: "rgba(12, 9, 38, 0.9)",
    borderColor: "rgba(151, 54, 255, 0.88)",
    borderRadius: 999,
    borderWidth: 2,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  connectStepNumberText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  connectStepRail: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    height: 3,
    width: 28
  },
  connectStepRailActive: {
    backgroundColor: "#9B40FF",
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8
  },
  connectSteps: {
    gap: 12,
    marginTop: 22
  },
  connectStepTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 25
  },
  connectStepTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 16
  },
  connectSimplePane: {
    gap: 10,
    marginTop: 10
  },
  connectSubtitle: {
    color: "rgba(226, 219, 255, 0.78)",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 4,
    maxWidth: 300,
    textAlign: "center"
  },
  connectTitle: {
    color: colors.text,
    fontSize: 33,
    fontWeight: "900",
    lineHeight: 44,
    marginTop: -5,
    textAlign: "center"
  },
  connectTitleAccent: {
    color: "#C241FF"
  },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700", marginBottom: 10, textAlign: "center" },
  frequencyCornerGlow: {
    backgroundColor: "rgba(163, 76, 255, 0.2)",
    borderRadius: 999,
    height: 92,
    left: -48,
    opacity: 0.64,
    position: "absolute",
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.36,
    shadowRadius: 28,
    top: -44,
    width: 92
  },
  frequencyCornerGlowSelected: {
    opacity: 0.9
  },
  frequencyBackdropImage: {
    ...StyleSheet.absoluteFillObject
  },
  resultBackdropImage: {
    ...StyleSheet.absoluteFillObject
  },
  frequencyHeader: {
    alignSelf: "stretch",
    marginBottom: 18
  },
  frequencyHelper: {
    color: "rgba(226, 219, 255, 0.72)",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21,
    marginTop: 10
  },
  frequencyOption: {
    alignItems: "center",
    backgroundColor: "rgba(8, 7, 28, 0.62)",
    borderColor: "rgba(171, 100, 255, 0.38)",
    borderRadius: 20,
    borderWidth: 1.4,
    height: 128,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingTop: 18,
    position: "relative",
    shadowColor: "#8C2DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.34,
    shadowRadius: 22,
    width: "100%"
  },
  frequencyOptionGrid: {
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14
  },
  frequencyOptionIcon: {
    height: 54,
    marginBottom: 12,
    width: 54
  },
  frequencyOptionMotion: {
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    width: "48%"
  },
  frequencyOptionPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }]
  },
  frequencyOptionSelected: {
    backgroundColor: "rgba(20, 9, 48, 0.78)",
    borderColor: "rgba(216, 134, 255, 0.95)",
    shadowOpacity: 0.5,
    shadowRadius: 28
  },
  frequencyOptionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
    textAlign: "center",
    textShadowColor: "rgba(255, 255, 255, 0.18)",
    textShadowOffset: { width: 0, height: 6 },
    textShadowRadius: 12
  },
  frequencyProgressWrap: {
    paddingHorizontal: 4,
    paddingTop: 10
  },
  frequencyQuestion: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: 0,
    position: "relative"
  },
  frequencySelectedGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(151, 54, 255, 0.12)",
    borderRadius: 20
  },
  frequencyTitle: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 41,
    maxWidth: 330,
    textShadowColor: "rgba(255, 255, 255, 0.2)",
    textShadowOffset: { width: 0, height: 8 },
    textShadowRadius: 16
  },
  flow: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 14
  },
  flowFrequency: {
    flex: 1,
    paddingBottom: 8,
    paddingHorizontal: 24,
    paddingTop: 8
  },
  flowResult: {
    flex: 1,
    paddingBottom: 8,
    paddingHorizontal: 24,
    paddingTop: 8
  },
  flowPaywall: {
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0
  },
  flowFullBleed: {
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0
  },
  flowMoment: {
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0
  },
  deviceChip: {
    alignItems: "center",
    backgroundColor: "rgba(10, 13, 28, 0.78)",
    borderColor: "rgba(255, 255, 255, 0.13)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: "absolute"
  },
  deviceChipDesktop: {
    bottom: 22,
    right: 24
  },
  deviceChipPhone: {
    left: 24,
    top: 26
  },
  deviceChipText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900"
  },
  deviceMomentPanel: {
    borderColor: "rgba(138, 247, 255, 0.12)",
    borderRadius: 34,
    borderWidth: 1,
    bottom: 88,
    left: 0,
    position: "absolute",
    right: 0,
    top: 64
  },
  deviceSyncBeam: {
    backgroundColor: "rgba(46, 235, 255, 0.38)",
    borderRadius: 999,
    height: 132,
    position: "absolute",
    width: 12
  },
  desktopList: {
    gap: 10,
    marginTop: 2
  },
  desktopResult: {
    alignItems: "center",
    backgroundColor: "rgba(46, 235, 255, 0.1)",
    borderColor: "rgba(138, 247, 255, 0.24)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14
  },
  desktopResultMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  desktopResultMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    marginTop: 2
  },
  desktopResultStatusChecking: {
    backgroundColor: "#FFE76A"
  },
  desktopResultStatusCurrent: {
    backgroundColor: "#70F0A2"
  },
  desktopResultStatusDot: {
    borderRadius: 999,
    height: 7,
    width: 7
  },
  desktopResultStatusOffline: {
    backgroundColor: "#7D778D"
  },
  desktopResultStatusOnline: {
    backgroundColor: "#51E895"
  },
  desktopResultTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  healthText: { color: colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 8, textAlign: "center" },
  generatingContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    width: "100%"
  },
  generatingCore: {
    alignItems: "center",
    borderColor: "rgba(214, 132, 255, 0.72)",
    borderRadius: 999,
    borderWidth: 1.5,
    height: 184,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#A13CFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.78,
    shadowRadius: 42,
    width: 184
  },
  generatingCoreGlass: {
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderRadius: 999,
    height: 136,
    left: 20,
    position: "absolute",
    top: 14,
    transform: [{ rotate: "-18deg" }],
    width: 72
  },
  generatingCoreShade: {
    backgroundColor: "rgba(5, 2, 18, 0.28)",
    borderRadius: 999,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: "44%"
  },
  generatingDot: {
    backgroundColor: "rgba(243, 233, 255, 0.96)",
    borderRadius: 999,
    height: 16,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.92,
    shadowRadius: 18,
    width: 16
  },
  generatingDots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 17,
    justifyContent: "center",
    zIndex: 1
  },
  generatingInnerRing: {
    borderColor: "rgba(159, 68, 255, 0.22)",
    borderRadius: 999,
    borderWidth: 1,
    height: 252,
    position: "absolute",
    width: 252
  },
  generatingOrbitDot: {
    borderRadius: 999,
    height: 16,
    position: "absolute",
    width: 16
  },
  generatingOrbitDotCyan: {
    backgroundColor: "#D978FF",
    right: -8,
    shadowColor: "#D978FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 16,
    top: "48%"
  },
  generatingOrbitDotMagenta: {
    backgroundColor: "#B154FF",
    left: 22,
    shadowColor: "#DD79FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 16,
    top: 18
  },
  generatingOrbitDotPurple: {
    backgroundColor: "#8C36FF",
    bottom: 18,
    left: 10,
    shadowColor: "#A46AFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 14
  },
  generatingOrbitGhost: {
    borderColor: "rgba(163, 76, 255, 0.1)",
    borderRadius: 999,
    borderWidth: 1,
    height: 300,
    position: "absolute",
    width: 300
  },
  generatingOrbitRing: {
    borderColor: "rgba(178, 80, 255, 0.78)",
    borderRadius: 999,
    borderWidth: 1.5,
    height: 270,
    position: "absolute",
    width: 270
  },
  generatingOuterGlow: {
    backgroundColor: "rgba(137, 38, 255, 0.28)",
    borderRadius: 999,
    height: 220,
    position: "absolute",
    shadowColor: "#AD4AFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.74,
    shadowRadius: 54,
    width: 220
  },
  generatingScreen: {
    flex: 1,
    overflow: "hidden"
  },
  generatingStatus: {
    color: "rgba(255, 255, 255, 0.98)",
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 33,
    textAlign: "center"
  },
  generatingStatusWrap: {
    alignItems: "center",
    marginTop: 28,
    width: "100%"
  },
  generatingSubtitle: {
    color: "rgba(222, 206, 255, 0.78)",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
    marginTop: 12,
    maxWidth: 280,
    textAlign: "center"
  },
  generatingTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    height: 10,
    marginTop: 30,
    overflow: "visible",
    width: "78%"
  },
  generatingTrackDot: {
    backgroundColor: "#D978FF",
    borderRadius: 999,
    height: 18,
    shadowColor: "#D978FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.98,
    shadowRadius: 16,
    width: 18
  },
  generatingTrackDotWrap: {
    marginLeft: -9,
    marginTop: -4,
    position: "absolute",
    top: 0
  },
  generatingTrackFill: {
    borderRadius: 999,
    height: 10,
    overflow: "hidden"
  },
  generatingTrackFillGradient: {
    ...StyleSheet.absoluteFillObject
  },
  generatingVisual: {
    alignItems: "center",
    height: 318,
    justifyContent: "center",
    width: "100%"
  },
  input: {
    backgroundColor: colors.elevated,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  identityIconShell: {
    alignItems: "center",
    height: 58,
    justifyContent: "center",
    width: 58
  },
  identityIcon: {
    height: 54,
    width: 54
  },
  insightIcon: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.72,
    shadowRadius: 20,
    width: 48
  },
  insightRow: {
    borderColor: "rgba(156, 89, 255, 0.42)",
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 62,
    overflow: "hidden",
    shadowColor: "#8A36FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    width: "100%"
  },
  insightRowFill: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minHeight: 62,
    overflow: "hidden",
    paddingHorizontal: 18,
    paddingVertical: 7,
    width: "100%"
  },
  insightRowGlow: {
    backgroundColor: "rgba(172, 90, 255, 0.14)",
    borderRadius: 999,
    bottom: -56,
    height: 120,
    position: "absolute",
    right: -34,
    shadowColor: "#A442FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.52,
    shadowRadius: 34,
    width: 170
  },
  insightStack: {
    gap: 8,
    marginTop: 14,
    width: "100%"
  },
  insightSubtitle: {
    color: "#BEB5DF",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 4,
    textAlign: "center"
  },
  insightText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20
  },
  insightChevron: {
    marginRight: -2
  },
  mainPlanLabel: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.text,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    textTransform: "uppercase"
  },
  momentBody: {
    color: "#D8D8EA",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 23,
    marginTop: 12,
    textAlign: "center"
  },
  momentBullet: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(138, 247, 255, 0.12)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    width: "100%"
  },
  momentBulletDot: {
    borderRadius: 999,
    height: 10,
    width: 10
  },
  momentBulletStack: {
    gap: 9,
    marginTop: 24,
    width: "100%"
  },
  momentBulletText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19
  },
  momentGlow: {
    backgroundColor: "rgba(46, 235, 255, 0.18)",
    borderRadius: 999,
    height: 220,
    position: "absolute",
    width: 220
  },
  momentImage: {
    height: 214,
    width: 214
  },
  momentKicker: {
    color: "#8AF7FF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 8,
    marginTop: 8,
    textAlign: "center",
    textTransform: "uppercase"
  },
  momentOrbit: {
    alignItems: "center",
    borderColor: "rgba(138, 247, 255, 0.16)",
    borderRadius: 999,
    borderWidth: 1,
    height: 236,
    justifyContent: "flex-start",
    paddingTop: 3,
    position: "absolute",
    width: 236
  },
  momentOrbitDot: {
    backgroundColor: "#8AF7FF",
    borderRadius: 999,
    height: 7,
    width: 7
  },
  momentScreen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    paddingBottom: 10,
    paddingHorizontal: 2
  },
  momentVisual: {
    alignItems: "center",
    height: 246,
    justifyContent: "center",
    marginBottom: 4,
    width: "100%"
  },
  mutedText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  momentProgressSafe: {
    width: "100%"
  },
  navRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 16
  },
  navRowFrequency: {
    justifyContent: "space-between",
    paddingBottom: 20,
    paddingTop: 8
  },
  navRowMoment: {
    paddingTop: 10,
    width: "100%"
  },
  nextButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18
  },
  nextButtonFrequency: {
    backgroundColor: "transparent",
    borderColor: "rgba(214, 132, 255, 0.98)",
    borderRadius: 21,
    minHeight: 56,
    overflow: "hidden",
    paddingHorizontal: 0,
    shadowColor: "#C86DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.96,
    shadowRadius: 28,
    width: 148
  },
  nextButtonFrequencyGradient: {
    alignItems: "center",
    borderRadius: 21,
    flexDirection: "row",
    gap: 13,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 14,
    shadowColor: "#D07CFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.88,
    shadowRadius: 22,
    width: "100%"
  },
  nextButtonDisabled: {
    opacity: 0.45
  },
  nextText: { color: colors.text, fontSize: 15, fontWeight: "800" },
  nextTextFrequency: {
    fontSize: 18,
    fontWeight: "900"
  },
  onboarding: { alignItems: "center", flex: 1, justifyContent: "center", padding: 22 },
  onboardingFooter: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 18 },
  option: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    justifyContent: "center",
    marginBottom: 12,
    minHeight: 124,
    padding: 12,
    position: "relative",
    width: "46%"
  },
  optionCheck: {
    position: "absolute",
    right: 10,
    top: 10
  },
  optionCopy: { alignItems: "center", minWidth: 0 },
  optionIcon: {
    height: 52,
    width: 52
  },
  persistentBackdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden"
  },
  optionIconShell: {
    alignItems: "center",
    height: 56,
    justifyContent: "center",
    width: 56
  },
  optionIconShellSelected: {
    transform: [{ scale: 1.04 }]
  },
  optionPressed: {
    transform: [{ scale: 0.98 }]
  },
  optionSelected: {
    backgroundColor: "#171722",
    borderColor: colors.accent
  },
  optionStack: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 26
  },
  optionTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
  outcomeNumber: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  outcomeNumberText: { color: colors.amber, fontSize: 13, fontWeight: "900" },
  outcomeRow: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  outcomeStack: { gap: 10, marginTop: 16, width: "100%" },
  outcomeText: { color: colors.text, flex: 1, fontSize: 15, fontWeight: "700", lineHeight: 21 },
  pairCodeCell: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 38
  },
  pairCodeInput: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  pairCodeRow: { flexDirection: "row", gap: 8, marginBottom: 14, marginTop: 12 },
  pairCodeText: { color: colors.text, fontSize: 18, fontWeight: "800" },
  pairInput: { alignSelf: "stretch", marginTop: 12, width: "100%" },
  pairPanel: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "rgba(18, 18, 26, 0.94)",
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 34,
    padding: 20
  },
  phonePermission: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    marginTop: 4,
    padding: 14
  },
  planCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18
  },
  planCardRecommended: {
    backgroundColor: "rgba(23, 23, 34, 0.96)",
    borderColor: colors.amber,
    borderWidth: 1.5
  },
  planCardSelected: {
    borderColor: colors.accent,
    transform: [{ scale: 1.01 }]
  },
  planCopy: { flex: 1, gap: 3, minWidth: 0 },
  planDetailLabel: { color: colors.dim, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  planDetailRow: {
    alignItems: "flex-start",
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    borderTopWidth: 1,
    gap: 4,
    paddingTop: 10
  },
  planDetails: {
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginTop: 14,
    padding: 14
  },
  planDetailsTitle: { color: colors.text, fontSize: 14, fontWeight: "900", marginBottom: 2 },
  planDetailValue: { color: colors.text, fontSize: 14, fontWeight: "800", lineHeight: 19 },
  planHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  planIcon: {
    alignItems: "center",
    height: 58,
    justifyContent: "center",
    width: 58
  },
  planIconRecommended: {
    transform: [{ scale: 1.05 }]
  },
  planIconImage: { height: 56, width: 56 },
  planCta: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 46
  },
  planCtaPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }]
  },
  planCtaText: { color: colors.text, fontSize: 15, fontWeight: "900" },
  planPrice: { color: colors.amber, fontSize: 14, fontWeight: "900" },
  planName: { color: colors.text, fontSize: 18, fontWeight: "900" },
  planStack: { gap: 14, marginTop: 28 },
  planSummary: { color: colors.muted, fontSize: 14, fontWeight: "600", lineHeight: 20, marginTop: 14 },
  planTitleRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  paywallBackground: {
    ...StyleSheet.absoluteFillObject
  },
  paywallAuraOne: {
    backgroundColor: "rgba(109, 59, 255, 0.28)",
    borderRadius: 999,
    height: 260,
    position: "absolute",
    right: -90,
    top: 60,
    width: 260
  },
  paywallAuraTwo: {
    backgroundColor: "rgba(242, 58, 205, 0.18)",
    borderRadius: 999,
    bottom: 120,
    height: 280,
    left: -120,
    position: "absolute",
    width: 280
  },
  paywallNoise: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.025)"
  },
  paywallBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  paywallBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900"
  },
  paywallCard: {
    backgroundColor: "rgba(13, 13, 18, 0.88)",
    borderColor: "rgba(139, 92, 255, 0.32)",
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 8,
    padding: 13,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    width: "100%"
  },
  paywallCardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  paywallClose: {
    alignItems: "center",
    alignSelf: "flex-end",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: 1,
    borderRadius: 14,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  paywallContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    minHeight: "100%",
    paddingHorizontal: 22,
    paddingTop: 34
  },
  paywallCta: {
    alignItems: "center",
    borderRadius: 999,
    minHeight: 52,
    justifyContent: "center"
  },
  paywallCtaText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900"
  },
  paywallCtaDisabled: {
    opacity: 0.72
  },
  paywallCtaWrap: {
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#5F24E5",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    width: "100%"
  },
  paywallDivider: {
    backgroundColor: "rgba(139, 92, 255, 0.24)",
    height: 1.5,
    marginBottom: 10,
    marginTop: 10,
    width: "100%"
  },
  paywallFeatureRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8
  },
  paywallFeatureStack: {
    gap: 7
  },
  paywallFeatureText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18
  },
  paywallErrorText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 8,
    textAlign: "center"
  },
  paywallFooter: {
    bottom: 0,
    left: 0,
    paddingHorizontal: 22,
    paddingTop: 8,
    position: "absolute",
    right: 0
  },
  paywallFooterText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 6,
    textAlign: "center"
  },
  paywallSuccessText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 8,
    textAlign: "center"
  },
  paywallHero: {
    marginTop: 0
  },
  paywallPlanName: {
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 30
  },
  paywallPlanPrice: {
    color: colors.muted,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
    marginTop: 3
  },
  paywallShell: {
    backgroundColor: colors.background,
    flex: 1,
    overflow: "hidden"
  },
  paywallTab: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    minHeight: 38,
    justifyContent: "center"
  },
  paywallTabActive: {
    backgroundColor: "rgba(109, 59, 255, 0.18)",
    borderColor: "rgba(139, 92, 255, 0.42)",
    borderWidth: 1
  },
  paywallTabs: {
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 999,
    borderWidth: 2,
    flexDirection: "row",
    gap: 4,
    marginTop: 16,
    padding: 4,
    width: "80%"
  },
  paywallTabText: {
    color: "rgba(255, 255, 255, 0.58)",
    fontSize: 13,
    fontWeight: "900"
  },
  paywallTitle: {
    color: colors.text,
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: -1.1,
    lineHeight: 35
  },
  paywallYearly: {
    color: colors.dim,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3
  },
  personaHero: {
    alignItems: "center",
    height: 150,
    justifyContent: "center",
    marginBottom: 2,
    marginTop: 0,
    position: "relative",
    width: "100%"
  },
  personaHeroGlow: {
    backgroundColor: "rgba(181, 76, 255, 0.18)",
    borderRadius: 999,
    height: 146,
    position: "absolute",
    shadowColor: "#C95DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 36,
    width: 146
  },
  personaHeroOrbit: {
    borderColor: "rgba(104, 52, 255, 0.24)",
    borderRadius: 999,
    borderWidth: 1,
    height: 176,
    position: "absolute",
    width: 176
  },
  personaIcon: {
    height: 140,
    shadowColor: "#FF6FD8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 26,
    width: 140
  },
  profileLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 22,
    textAlign: "center"
  },
  pricingContent: { flexGrow: 1, justifyContent: "center", paddingBottom: 18, paddingTop: 16 },
  prereqRow: { alignItems: "center", alignSelf: "stretch", flexDirection: "row", gap: 10, marginBottom: 18 },
  progressFill: {
    borderRadius: 999,
    height: "100%"
  },
  progressRail: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    height: 7,
    overflow: "hidden"
  },
  progressWrap: {
    alignSelf: "stretch",
    paddingHorizontal: 2,
    paddingTop: 6
  },
  promise: { color: colors.muted, fontSize: 18, fontWeight: "700", marginTop: -8, textAlign: "center" },
  questionHelper: { color: colors.dim, fontSize: 14, fontWeight: "700", lineHeight: 20, marginTop: 8 },
  question: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: 10
  },
  resultContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingBottom: 4,
    paddingTop: 0
  },
  resultProgressWrap: {
    paddingHorizontal: 8,
    paddingTop: 8
  },
  resultTitleBlock: {
    alignItems: "center",
    width: "100%"
  },
  resultTitleGradientFill: {
    height: 40,
    width: "100%"
  },
  resultTitleGradientMask: {
    alignSelf: "center",
    height: 40,
    justifyContent: "flex-start",
    overflow: "visible",
    width: "100%"
  },
  resultTitleGradientText: {
    color: colors.text,
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 37,
    textAlign: "center"
  },
  resultTitlePrimary: {
    color: colors.text,
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 35,
    textAlign: "center",
    textShadowColor: "rgba(255, 255, 255, 0.22)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
    width: "100%"
  },
  resultTitle: { textAlign: "center", width: "100%" },
  rowContent: { flex: 1, minWidth: 0 },
  rowMeta: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 3, textAlign: "center" },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
  sectionTitle: { alignSelf: "flex-start", color: colors.text, fontSize: 18, fontWeight: "900", lineHeight: 24, marginTop: 26 },
  shell: { backgroundColor: colors.background, flex: 1 },
  sliderDot: {
    backgroundColor: "rgba(8, 7, 28, 0.95)",
    borderColor: "rgba(186, 170, 255, 0.62)",
    borderRadius: 999,
    borderWidth: 2,
    height: 17,
    width: 17
  },
  sliderDotActive: {
    backgroundColor: "#B15CFF",
    borderColor: "#D48AFF",
    shadowColor: "#B33BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.72,
    shadowRadius: 9
  },
  sliderFill: {
    backgroundColor: "#C56BFF",
    borderRadius: 999,
    height: 6,
    left: 0,
    position: "absolute",
    shadowColor: "#C56BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 10,
    top: 21
  },
  sliderIcon: {
    height: 44,
    opacity: 0.78,
    width: 44
  },
  sliderIconActive: {
    opacity: 1
  },
  sliderOption: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 18,
    borderWidth: 0,
    gap: 7,
    height: 112,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 6,
    position: "relative",
    width: "23%"
  },
  sliderOptionActive: {},
  sliderOptionPressed: {
    opacity: 0.92
  },
  sliderOptions: {
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    width: "100%"
  },
  sliderOptionText: { color: "rgba(226, 219, 255, 0.72)", fontSize: 11, fontWeight: "900", lineHeight: 14, textAlign: "center", textShadowColor: "rgba(181, 92, 255, 0.12)", textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 12 },
  sliderOptionTextActive: { color: colors.text, textShadowColor: "rgba(212, 124, 255, 0.42)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 },
  sliderStop: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    marginLeft: -24,
    position: "absolute",
    top: 0,
    width: 48
  },
  sliderThumb: {
    backgroundColor: colors.text,
    borderColor: "#CD79FF",
    borderRadius: 999,
    borderWidth: 3,
    height: 26,
    marginLeft: -13,
    position: "absolute",
    shadowColor: "#D07CFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 16,
    top: 11,
    width: 26
  },
  sliderTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 999,
    height: 6,
    left: 0,
    position: "absolute",
    right: 0,
    top: 21
  },
  sliderTrackWrap: {
    alignSelf: "center",
    height: 48,
    marginTop: 22,
    width: "88%"
  },
  stepBody: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 10
  },
  stepBodyFullBleed: {
    justifyContent: "flex-start",
    paddingTop: 0
  },
  syncAuraCyan: {
    backgroundColor: "rgba(46, 235, 255, 0.16)",
    borderRadius: 999,
    height: 360,
    left: -150,
    position: "absolute",
    top: 36,
    width: 360
  },
  syncAuraPurple: {
    backgroundColor: "rgba(109, 59, 255, 0.18)",
    borderRadius: 999,
    bottom: 86,
    height: 380,
    position: "absolute",
    right: -150,
    width: 380
  },
  syncAuroraBand: {
    borderRadius: 999,
    height: 260,
    left: -70,
    position: "absolute",
    right: -90,
    top: 82,
    transform: [{ rotate: "11deg" }]
  },
  syncAuroraBandBottom: {
    borderRadius: 999,
    bottom: 76,
    height: 220,
    left: -90,
    position: "absolute",
    right: -70,
    transform: [{ rotate: "-13deg" }]
  },
  syncBackButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    height: 52,
    justifyContent: "center",
    width: 52
  },
  syncBeam: {
    backgroundColor: "rgba(46, 235, 255, 0.46)",
    borderRadius: 999,
    height: 7,
    position: "absolute",
    shadowColor: "#2EEBFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 12,
    width: 230
  },
  syncCard: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "flex-start",
    minHeight: 112,
    paddingHorizontal: 8,
    paddingVertical: 10
  },
  syncCardBody: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13,
    marginTop: 4,
    textAlign: "center"
  },
  syncCardCopy: {
    alignItems: "center",
    minWidth: 0
  },
  syncCardIcon: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    marginBottom: 9,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    width: 34
  },
  syncCards: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    width: "100%"
  },
  syncCardTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 15,
    textAlign: "center"
  },
  syncCenterOrb: {
    alignItems: "center",
    backgroundColor: "rgba(46, 235, 255, 0.2)",
    borderColor: "rgba(138, 247, 255, 0.7)",
    borderRadius: 999,
    borderWidth: 2,
    height: 72,
    justifyContent: "center",
    position: "absolute",
    shadowColor: "#2EEBFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
    width: 72
  },
  syncContent: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: 0
  },
  syncDesktopLabel: {
    bottom: 16,
    right: 4
  },
  syncDeviceLabel: {
    alignItems: "center",
    backgroundColor: "rgba(9, 11, 19, 0.84)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: "absolute"
  },
  syncDeviceLabelText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  syncFooter: {
    bottom: 0,
    left: 0,
    paddingBottom: 14,
    paddingHorizontal: 20,
    paddingTop: 14,
    position: "absolute",
    right: 0
  },
  syncHero: {
    alignItems: "center",
    height: 228,
    justifyContent: "center",
    marginTop: 8,
    width: "100%"
  },
  syncHeroGlowBlue: {
    backgroundColor: "rgba(46, 235, 255, 0.22)",
    borderRadius: 999,
    height: 148,
    left: 28,
    position: "absolute",
    shadowColor: "#8AF7FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 28,
    top: 30,
    width: 148
  },
  syncHeroGlowPink: {
    backgroundColor: "rgba(242, 58, 205, 0.18)",
    borderRadius: 999,
    height: 138,
    position: "absolute",
    right: 36,
    shadowColor: "#FF7DE3",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 26,
    top: 58,
    width: 138
  },
  syncHeroGlowPurple: {
    backgroundColor: "rgba(109, 59, 255, 0.2)",
    borderRadius: 999,
    bottom: 18,
    height: 168,
    position: "absolute",
    shadowColor: "#A76DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.56,
    shadowRadius: 30,
    width: 220
  },
  syncHeroImage: {
    height: 228,
    width: 318
  },
  syncMobileLabel: {
    bottom: 20,
    left: 4
  },
  syncPill: {
    alignItems: "center",
    backgroundColor: "rgba(46, 235, 255, 0.08)",
    borderColor: "rgba(46, 235, 255, 0.38)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 0,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  syncPillText: {
    color: "#8AF7FF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase"
  },
  syncProgress: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    paddingHorizontal: 18
  },
  syncProgressDash: {
    backgroundColor: "rgba(255, 255, 255, 0.24)",
    borderRadius: 999,
    height: 6,
    width: 34
  },
  syncProgressDashActive: {
    backgroundColor: "#2EEBFF"
  },
  syncScreen: {
    flex: 1,
    overflow: "hidden"
  },
  syncSkipButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 20,
    borderWidth: 1,
    height: 52,
    justifyContent: "center",
    paddingHorizontal: 20
  },
  syncSkipText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  syncStarOne: {
    backgroundColor: "#8AF7FF",
    borderRadius: 999,
    height: 4,
    position: "absolute",
    right: 34,
    top: 250,
    width: 4
  },
  syncStarTwo: {
    backgroundColor: colors.magenta,
    borderRadius: 999,
    bottom: 224,
    height: 4,
    left: 34,
    position: "absolute",
    width: 4
  },
  syncSubtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 318,
    textAlign: "center"
  },
  syncGradientFill: {
    height: 42,
    width: "100%"
  },
  syncGradientMask: {
    height: 42,
    justifyContent: "flex-start",
    overflow: "visible",
    width: 176
  },
  syncTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 38,
    marginTop: 14,
    textAlign: "center"
  },
  syncTitleBlock: {
    alignItems: "center",
    marginTop: 14
  },
  syncTitleGradientMaskText: {
    lineHeight: 38,
    marginTop: 0,
    textAlign: "left"
  },
  syncTitleInline: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 38,
    marginTop: 0,
    textAlign: "center"
  },
  syncTitleLine: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 38
  },
  syncTopBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 18
  },
  subtitle: { color: colors.muted, fontSize: 15, fontWeight: "600", lineHeight: 22, marginTop: 12 },
  title: { color: colors.text, fontSize: 31, fontWeight: "900", lineHeight: 38 },
  trialRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    paddingHorizontal: 4
  },
  trialText: { color: colors.muted, flex: 1, fontSize: 13, fontWeight: "700", lineHeight: 18 }
});
