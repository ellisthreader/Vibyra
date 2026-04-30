import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinkButton, PrimaryButton } from "../components/Buttons";
import { VibyraLogo } from "../components/VibyraLogo";
import { useAppContext } from "../context/AppContext";
import { colors } from "../styles/theme";

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
  const [step, setStep] = useState<OnboardingStep>(0);
  const [momentStep, setMomentStep] = useState<QuizStep | null>(null);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [profileGenerating, setProfileGenerating] = useState(false);
  const persona = useMemo(() => calculatePersona(answers), [answers]);
  const personaModel = personaModels[persona];
  const progressStep = Math.min((momentStep ?? step) + 1, 7);
  const showingMoment = momentStep !== null;
  const canContinue = showingMoment || canContinueFromStep(step, answers);

  useEffect(() => {
    if (step !== 5) {
      setProfileGenerating(false);
      return;
    }

    setProfileGenerating(true);
    const timer = setTimeout(() => setProfileGenerating(false), 1900);
    return () => clearTimeout(timer);
  }, [step, persona]);

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
    <SafeAreaView style={styles.shell}>
      <StatusBar style="light" />
      <LinearGradient colors={["#08070D", "#100C18", "#07070A"]} style={styles.shell}>
        <OnboardingBackdrop />
        {step < 7 ? (
          <View style={[
            styles.flow,
            step === 6 && !showingMoment ? styles.flowPaywall : null,
            showingMoment ? styles.flowMoment : null
          ]}>
            {step === 6 && !showingMoment ? null : <ProgressIndicator step={progressStep} total={7} />}

            <AnimatedStep transitionKey={showingMoment ? `moment-${momentStep}` : `step-${step}`}>
              {showingMoment ? (
                <QuestionMomentScreen step={momentStep} answers={answers} />
              ) : null}

              {!showingMoment && step === 0 ? (
                <QuestionScreen
                  title="How often will you code with Vibyra?"
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
                profileGenerating ? <ProfileGeneratingScreen persona={personaModel} /> : <InsightScreen personaId={persona} persona={personaModel} />
              ) : null}
              {!showingMoment && step === 6 ? <PricingScreen persona={personaModel} onClose={() => setStep(5)} /> : null}
            </AnimatedStep>

            {step === 6 && !showingMoment ? null : <View style={styles.navRow}>
              {showingMoment || step > 0 ? (
                <Pressable style={styles.backButton} onPress={back}>
                  <Ionicons name="chevron-back" color={colors.muted} size={18} />
                  <Text style={styles.backText}>Back</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable
                disabled={!canContinue || profileGenerating}
                style={[styles.nextButton, !canContinue || profileGenerating ? styles.nextButtonDisabled : null]}
                onPress={next}
              >
                <Text style={styles.nextText}>
                  {showingMoment ? "Continue" : step === 4 ? "Skip" : step === 5 ? "Continue" : step === 6 ? "Start free trial" : "Continue"}
                </Text>
                <Ionicons name="arrow-forward" color={colors.text} size={18} />
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

function AnimatedStep({ children, transitionKey }: { children: React.ReactNode; transitionKey: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(18);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]).start();
  }, [opacity, transitionKey, translateY]);

  return (
    <Animated.View style={[styles.stepBody, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
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
  const { answers, step } = props;
  const content = getMomentContent(answers);
  const float = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const image = momentIcons[step] ?? momentIcons[2];

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1700,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1700,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true
        })
      ])
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        })
      ])
    );
    floatLoop.start();
    pulseLoop.start();

    return () => {
      floatLoop.stop();
      pulseLoop.stop();
    };
  }, [float, pulse]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [8, -10] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.78] });

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

      <ScrollView contentContainerStyle={styles.syncContent} showsVerticalScrollIndicator={false}>
        <View style={styles.syncPill}>
          <Ionicons name="sync" color="#2EEBFF" size={17} />
          <Text style={styles.syncPillText}>Cross-device sync</Text>
        </View>

        <Text style={styles.syncTitle}>
          Start anywhere.
          {"\n"}
          Continue <Text style={styles.syncTitleGradient}>everywhere.</Text>
        </Text>

        <Text style={styles.syncSubtitle}>{content.body}</Text>

        <View style={styles.syncHero}>
          <Animated.View style={[styles.syncHeroGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
          <Animated.Image
            resizeMode="contain"
            source={image}
            style={[styles.syncHeroImage, { transform: [{ translateY }] }]}
          />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

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

function QuestionScreen<T extends string>(props: {
  title: string;
  helper?: string;
  options: Array<{ label: string; value: T; icon: ImageSourcePropType }>;
  selected: T | T[] | null;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.question}>
      <Text style={styles.title}>{props.title}</Text>
      {props.helper ? <Text style={styles.questionHelper}>{props.helper}</Text> : null}

      <View style={styles.optionStack}>
        {props.options.map((option) => {
          const selected = Array.isArray(props.selected)
            ? props.selected.includes(option.value)
            : props.selected === option.value;
          return (
            <Pressable
              key={option.value}
              style={({ pressed }) => [
                styles.option,
                selected ? styles.optionSelected : null,
                pressed ? styles.optionPressed : null
              ]}
              onPress={() => props.onSelect(option.value)}
            >
              <View style={[styles.optionIconShell, selected ? styles.optionIconShellSelected : null]}>
                <Image resizeMode="contain" source={option.icon} style={styles.optionIcon} />
              </View>
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>{option.label}</Text>
              </View>
              <Ionicons
                name={selected ? "checkmark-circle" : "ellipse-outline"}
                color={selected ? colors.amber : colors.dim}
                size={22}
                style={styles.optionCheck}
              />
            </Pressable>
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
    <View style={styles.question}>
      <Text style={styles.title}>What best describes you?</Text>
      <Text style={styles.questionHelper}>Optional. Tap one or skip.</Text>

      <View style={styles.optionStack}>
        {identityOptions.map((option) => {
          const selected = props.selected === option.value;
          return (
            <Pressable
              key={option.value}
              style={({ pressed }) => [
                styles.option,
                selected ? styles.optionSelected : null,
                pressed ? styles.optionPressed : null
              ]}
              onPress={() => props.onSelect(option.value)}
            >
              <View style={[styles.identityIconShell, selected ? styles.optionIconShellSelected : null]}>
                <Image resizeMode="contain" source={option.icon} style={styles.identityIcon} />
              </View>
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>{option.label}</Text>
              </View>
              <Ionicons
                name={selected ? "checkmark-circle" : "ellipse-outline"}
                color={selected ? colors.amber : colors.dim}
                size={22}
                style={styles.optionCheck}
              />
            </Pressable>
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
    <View style={styles.question}>
      <Text style={styles.title}>{props.title}</Text>

      <View style={styles.sliderOptions}>
        {depthOptions.map((option) => {
          const active = props.selected === option.value;
          return (
            <Pressable key={option.value} style={styles.sliderOption} onPress={() => props.onSelect(option.value)}>
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

function ProfileGeneratingScreen({ persona }: { persona: PersonaModel }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        })
      ])
    );
    const scanLoop = Animated.loop(
      Animated.timing(scan, {
        toValue: 1,
        duration: 1450,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true
      })
    );
    const rotateLoop = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 3600,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );

    pulseLoop.start();
    scanLoop.start();
    rotateLoop.start();

    return () => {
      pulseLoop.stop();
      scanLoop.stop();
      rotateLoop.stop();
    };
  }, [pulse, rotate, scan]);

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.42, 0.78] });
  const scanY = scan.interpolate({ inputRange: [0, 1], outputRange: [-82, 82] });
  const rotateZ = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={styles.generatingScreen}>
      <View style={styles.generatingVisual}>
        <Animated.View style={[styles.generatingHalo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
        <Animated.View style={[styles.generatingOrbit, { transform: [{ rotate: rotateZ }] }]}>
          <View style={styles.generatingOrbitDot} />
        </Animated.View>
        <Image resizeMode="contain" source={persona.icon} style={styles.generatingIcon} />
        <Animated.View style={[styles.generatingScan, { transform: [{ translateY: scanY }] }]} />
      </View>

      <Text style={styles.generatingKicker}>Analyzing your answers</Text>
      <Text style={[styles.title, styles.resultTitle]}>Generating your builder profile</Text>
      <Text style={styles.generatingCopy}>Matching your workflow, goals, and build style to the right Vibyra setup.</Text>

      <View style={styles.generatingSteps}>
        {["Reading your intent", "Mapping your workflow", "Preparing your recommendation"].map((item) => (
          <View key={item} style={styles.generatingStep}>
            <LinearGradient colors={["#2EEBFF", colors.accent, colors.magenta]} style={styles.generatingStepDot} />
            <Text style={styles.generatingStepText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function InsightScreen({ personaId, persona }: { personaId: Persona; persona: PersonaModel }) {
  const insight = personaInsights[personaId];

  return (
    <ScrollView contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
      <View style={styles.personaHero}>
        <Image resizeMode="contain" source={persona.icon} style={styles.personaIcon} />
      </View>
      <Text style={[styles.title, styles.resultTitle]}>You're a {persona.name}</Text>
      <Text style={styles.insightSubtitle}>What you could build:</Text>

      <View style={styles.insightStack}>
        {insight.bullets.map((bullet) => (
          <View key={bullet.text} style={styles.insightRow}>
            <View style={styles.insightIcon}>
              <Ionicons name={bullet.icon} color="#8AF7FF" size={18} />
            </View>
            <Text style={styles.insightText}>{bullet.text}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function PricingScreen({ persona, onClose }: { persona: PersonaModel; onClose: () => void }) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>(persona.recommendedPlan);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("annual");
  const auraMotion = useRef(new Animated.Value(getPlanMotionValue(persona.recommendedPlan))).current;
  const selected = plans.find((plan) => plan.name === selectedPlan) ?? plans[0];
  const theme = getPlanTheme(selected.name);
  const selectedPrice = billingPeriod === "monthly" ? selected.monthlyPrice : selected.yearlyPrice;
  const billingLabel = billingPeriod === "monthly" ? "Monthly" : "Annual";

  useEffect(() => {
    Animated.timing(auraMotion, {
      toValue: getPlanMotionValue(selectedPlan),
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [auraMotion, selectedPlan]);

  const auraOneTranslateX = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [-24, 0, 26] });
  const auraOneTranslateY = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [18, 0, -14] });
  const auraOneScale = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [0.9, 1.08, 1.18] });
  const auraTwoTranslateX = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [28, 0, -30] });
  const auraTwoTranslateY = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [-16, 0, 20] });
  const auraTwoScale = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [1.12, 1, 0.92] });

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
      <ScrollView contentContainerStyle={styles.paywallContent} scrollEnabled={false} showsVerticalScrollIndicator={false}>
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

        <View style={styles.paywallCard}>
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
        </View>
      </ScrollView>

      <View style={styles.paywallFooter}>
        <Pressable style={({ pressed }) => [styles.paywallCtaWrap, pressed ? styles.planCtaPressed : null]}>
          <LinearGradient
            colors={theme.button}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.paywallCta}
          >
            <Text style={styles.paywallCtaText}>Upgrade to {selected.name} {billingLabel}</Text>
          </LinearGradient>
        </Pressable>
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

function ProgressIndicator({ step, total }: { step: number; total: number }) {
  const progress = `${(step / total) * 100}%` as `${number}%`;

  return (
    <View style={styles.progressWrap}>
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

  return (
    <View style={styles.onboarding}>
      <VibyraLogo />
      <Text style={styles.promise}>Your AI software studio, anywhere.</Text>

      <View style={styles.pairPanel}>
        <View style={styles.prereqRow}>
          <Ionicons name="desktop-outline" color={colors.amber} size={19} />
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Open Vibyra Desktop</Text>
            <Text style={styles.rowMeta}>{app.pairingMessage}</Text>
          </View>
        </View>

        <View style={styles.codeHalo}>
          <Text style={styles.codeLabel}>Pairing key</Text>
        </View>
        <TextInput
          value={app.pairCode}
          onChangeText={(value) => app.setPairCode(value.toUpperCase())}
          placeholder="Pair code"
          placeholderTextColor={colors.dim}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={[styles.input, styles.pairInput, styles.pairCodeInput]}
        />

        <LinkButton
          icon="search-outline"
          label={app.checkingHealth ? "Finding Vibyra..." : "Find Vibyra"}
          onPress={app.testDesktopConnection}
        />
        {app.healthMessage ? <Text style={styles.healthText}>{app.healthMessage}</Text> : null}
        <PairCode code={app.pairCode} />
        {app.pairingError ? <Text style={styles.errorText}>{app.pairingError}</Text> : null}
        <PairAction />
      </View>

      <View style={styles.onboardingFooter}>
        <Ionicons name="shield-checkmark-outline" color={colors.success} size={18} />
        <Text style={styles.mutedText}>Trusted devices only via Vibyra pairing</Text>
      </View>
    </View>
  );
}

function PairAction() {
  const app = useAppContext();
  if (!app.pendingPhoneApproval) {
    return (
      <PrimaryButton
        icon="link-outline"
        label={app.pairing ? "Finding Vibyra..." : "Pair phone"}
        onPress={app.pairMachine}
      />
    );
  }

  return (
    <View style={styles.phonePermission}>
      <Ionicons name="shield-checkmark-outline" color={colors.success} size={22} />
      <Text style={styles.rowTitle}>Allow {app.pendingPhoneApproval.machineName}?</Text>
      <Text style={styles.rowMeta}>
        Vibyra can show projects, receive prompts, run approved commands, and send live updates.
      </Text>
      <PrimaryButton icon="checkmark-circle-outline" label="Allow Vibyra" onPress={app.confirmPhonePermission} />
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
  backText: { color: colors.muted, fontSize: 15, fontWeight: "700" },
  billingSave: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "900",
    marginTop: 1
  },
  billingTab: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    justifyContent: "center",
    minHeight: 38
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
    marginTop: 8,
    padding: 4,
    width: "68%"
  },
  billingTabText: {
    color: "rgba(255, 255, 255, 0.58)",
    fontSize: 13,
    fontWeight: "900"
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden"
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
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700", marginBottom: 10, textAlign: "center" },
  flow: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 14
  },
  flowPaywall: {
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0
  },
  flowMoment: {
    paddingBottom: 20,
    paddingHorizontal: 20,
    paddingTop: 14
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
  healthText: { color: colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 8, textAlign: "center" },
  generatingCopy: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 23,
    marginTop: 12,
    textAlign: "center"
  },
  generatingHalo: {
    backgroundColor: "rgba(46, 235, 255, 0.16)",
    borderRadius: 999,
    height: 190,
    position: "absolute",
    width: 190
  },
  generatingIcon: {
    height: 136,
    width: 136
  },
  generatingKicker: {
    color: "#8AF7FF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 8,
    textAlign: "center",
    textTransform: "uppercase"
  },
  generatingOrbit: {
    alignItems: "center",
    borderColor: "rgba(138, 247, 255, 0.22)",
    borderRadius: 999,
    borderWidth: 1,
    height: 214,
    justifyContent: "flex-start",
    paddingTop: 4,
    position: "absolute",
    width: 214
  },
  generatingOrbitDot: {
    backgroundColor: "#8AF7FF",
    borderRadius: 999,
    height: 8,
    shadowColor: "#8AF7FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    width: 8
  },
  generatingScan: {
    backgroundColor: "rgba(138, 247, 255, 0.42)",
    borderRadius: 999,
    height: 3,
    position: "absolute",
    shadowColor: "#8AF7FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 14,
    width: 190
  },
  generatingScreen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingBottom: 10
  },
  generatingStep: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    width: "100%"
  },
  generatingStepDot: {
    borderRadius: 999,
    height: 10,
    width: 10
  },
  generatingSteps: {
    gap: 9,
    marginTop: 24,
    width: "100%"
  },
  generatingStepText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "800"
  },
  generatingVisual: {
    alignItems: "center",
    height: 230,
    justifyContent: "center",
    marginBottom: 8,
    overflow: "hidden",
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
    backgroundColor: "rgba(46, 235, 255, 0.12)",
    borderColor: "rgba(138, 247, 255, 0.34)",
    borderRadius: 12,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  insightRow: {
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
  insightStack: { gap: 10, marginTop: 26, width: "100%" },
  insightSubtitle: { color: colors.muted, fontSize: 15, fontWeight: "700", lineHeight: 22, marginTop: 12, textAlign: "center" },
  insightText: { color: colors.text, flex: 1, fontSize: 15, fontWeight: "800", lineHeight: 21 },
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
  navRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 16
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
  nextButtonDisabled: {
    opacity: 0.45
  },
  nextText: { color: colors.text, fontSize: 15, fontWeight: "800" },
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
    paddingHorizontal: 11,
    paddingVertical: 6
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
    marginTop: 12,
    padding: 16,
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
    height: 44,
    justifyContent: "center",
    width: 44
  },
  paywallContent: {
    flexGrow: 1,
    paddingBottom: 114,
    paddingHorizontal: 22,
    paddingTop: 12
  },
  paywallCta: {
    alignItems: "center",
    borderRadius: 999,
    minHeight: 56,
    justifyContent: "center"
  },
  paywallCtaText: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900"
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
    marginBottom: 12,
    marginTop: 12,
    width: "100%"
  },
  paywallFeatureRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  paywallFeatureStack: {
    gap: 9
  },
  paywallFeatureText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20
  },
  paywallFooter: {
    bottom: 0,
    left: 0,
    paddingBottom: 10,
    paddingHorizontal: 22,
    paddingTop: 10,
    position: "absolute",
    right: 0
  },
  paywallFooterText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center"
  },
  paywallHero: {
    marginTop: 18
  },
  paywallPlanName: {
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 33
  },
  paywallPlanPrice: {
    color: colors.muted,
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 24,
    marginTop: 4
  },
  paywallShell: {
    backgroundColor: colors.background,
    flex: 1,
    marginTop: -10,
    overflow: "hidden"
  },
  paywallTab: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    minHeight: 42,
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
    marginTop: 34,
    padding: 5,
    width: "72%"
  },
  paywallTabText: {
    color: "rgba(255, 255, 255, 0.58)",
    fontSize: 14,
    fontWeight: "900"
  },
  paywallTitle: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1.1,
    lineHeight: 39
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
    marginTop: -24,
    width: "100%"
  },
  personaIcon: {
    height: 132,
    width: 132
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
  resultContent: { alignItems: "center", flexGrow: 1, justifyContent: "center", paddingBottom: 12 },
  resultTitle: { textAlign: "center", width: "100%" },
  rowContent: { flex: 1, minWidth: 0 },
  rowMeta: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 3, textAlign: "center" },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
  sectionTitle: { alignSelf: "flex-start", color: colors.text, fontSize: 18, fontWeight: "900", lineHeight: 24, marginTop: 26 },
  shell: { backgroundColor: colors.background, flex: 1 },
  sliderDot: {
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 2,
    height: 18,
    width: 18
  },
  sliderDotActive: {
    backgroundColor: colors.amber,
    borderColor: colors.amber
  },
  sliderFill: {
    backgroundColor: colors.amber,
    borderRadius: 999,
    height: 6,
    left: 0,
    position: "absolute",
    top: 21
  },
  sliderIcon: {
    height: 48,
    opacity: 0.7,
    width: 48
  },
  sliderIconActive: {
    opacity: 1,
    transform: [{ scale: 1.08 }]
  },
  sliderOption: {
    alignItems: "center",
    gap: 8,
    width: "23%"
  },
  sliderOptions: {
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 34,
    width: "92%"
  },
  sliderOptionText: { color: colors.dim, fontSize: 13, fontWeight: "800", textAlign: "center" },
  sliderOptionTextActive: { color: colors.text },
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
    borderColor: colors.amber,
    borderRadius: 999,
    borderWidth: 3,
    height: 26,
    marginLeft: -13,
    position: "absolute",
    top: 11,
    width: 26
  },
  sliderTrack: {
    backgroundColor: colors.border,
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
    marginTop: 34,
    width: "82%"
  },
  stepBody: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 10
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
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minHeight: 156,
    paddingHorizontal: 12,
    paddingVertical: 16
  },
  syncCardBody: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center"
  },
  syncCardIcon: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1.5,
    height: 58,
    justifyContent: "center",
    marginBottom: 14,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    width: 58
  },
  syncCards: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    width: "100%"
  },
  syncCardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
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
    paddingBottom: 24,
    paddingHorizontal: 20,
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
    height: 310,
    justifyContent: "center",
    marginTop: 18,
    width: "100%"
  },
  syncHeroGlow: {
    backgroundColor: "rgba(109, 59, 255, 0.2)",
    borderRadius: 999,
    height: 250,
    position: "absolute",
    width: 330
  },
  syncHeroImage: {
    height: 310,
    width: 390
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
    gap: 10,
    marginTop: 0,
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  syncPillText: {
    color: "#8AF7FF",
    fontSize: 14,
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
    marginHorizontal: -20,
    marginBottom: -20,
    marginTop: -8,
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
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 25,
    marginTop: 12,
    maxWidth: 330,
    textAlign: "center"
  },
  syncTitle: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1.4,
    lineHeight: 39,
    marginTop: 20,
    textAlign: "center"
  },
  syncTitleGradient: {
    color: colors.magenta
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
