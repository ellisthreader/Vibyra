import { ImageSourcePropType } from "react-native";
import { Answers, BuilderIdentity, QuizStep, UsageDepth, UsageFrequency } from "../types";

export const connectBackdrop = require("../../../assets/front-page-nebula.png");
export const frequencyBackdrop = require("../../../assets/onboarding-quiz-background.png");
export const momentBackdrop = require("../../../assets/onboarding-moment-background.png");
export const resultBackdrop = require("../../../assets/onboarding-quiz-background.png");

export const weeklyOutcomes: Record<UsageFrequency, string[]> = {
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

export const resultBulletAccents = [
  { color: "#7C4DFF", glow: "rgba(124, 77, 255, 0.28)", border: "rgba(124, 77, 255, 0.58)" },
  { color: "#B642FF", glow: "rgba(182, 66, 255, 0.28)", border: "rgba(182, 66, 255, 0.58)" },
  { color: "#FF55C8", glow: "rgba(255, 85, 200, 0.24)", border: "rgba(255, 85, 200, 0.52)" },
  { color: "#FF6EA9", glow: "rgba(255, 110, 169, 0.24)", border: "rgba(255, 110, 169, 0.52)" }
];

export const initialAnswers: Answers = {
  frequency: null,
  intent: [],
  device: null,
  depth: "light",
  identity: null
};

export const optionIcons = {
  rarely: require("../../../assets/onboarding-icons/rarely.png"),
  occasionally: require("../../../assets/onboarding-icons/occasionally.png"),
  fewTimesWeek: require("../../../assets/onboarding-icons/few-times-week.png"),
  everyDay: require("../../../assets/onboarding-icons/every-day.png"),
  exploring: require("../../../assets/onboarding-icons/exploring.png"),
  learning: require("../../../assets/onboarding-icons/learning.png"),
  sideProject: require("../../../assets/onboarding-icons/side-project.png"),
  appWebsite: require("../../../assets/onboarding-icons/app-website.png"),
  work: require("../../../assets/onboarding-icons/work.png"),
  automation: require("../../../assets/onboarding-icons/automation.png"),
  phoneFirst: require("../../../assets/onboarding-icons/phone-first.png"),
  phoneComputer: require("../../../assets/onboarding-icons/phone-computer.png"),
  computerEdits: require("../../../assets/onboarding-icons/computer-edits.png"),
  other: require("../../../assets/onboarding-icons/anywhere.png"),
  light: require("../../../assets/onboarding-icons/light.png"),
  steady: require("../../../assets/onboarding-icons/steady.png"),
  heavy: require("../../../assets/onboarding-icons/heavy.png"),
  max: require("../../../assets/onboarding-icons/max.png")
} satisfies Record<string, ImageSourcePropType>;

export const momentIcons: Partial<Record<QuizStep, ImageSourcePropType>> = {
  2: require("../../../assets/moment-icons/device-sync-hero.png")
};

export const identityOptions: Array<{ label: string; value: BuilderIdentity; icon: ImageSourcePropType }> = [
  { label: "Beginner", value: "beginner", icon: require("../../../assets/identity-icons/beginner.png") },
  { label: "Student", value: "student", icon: require("../../../assets/identity-icons/student.png") },
  { label: "Developer", value: "developer", icon: require("../../../assets/identity-icons/developer.png") },
  { label: "Founder / freelancer", value: "founder_freelancer", icon: require("../../../assets/identity-icons/founder-freelancer.png") }
];

export const depthOptions: Array<{ label: string; value: UsageDepth; icon: ImageSourcePropType }> = [
  { label: "Light", value: "light", icon: optionIcons.light },
  { label: "Steady", value: "steady", icon: optionIcons.steady },
  { label: "Heavy", value: "heavy", icon: optionIcons.heavy },
  { label: "Max", value: "max", icon: optionIcons.max }
];
