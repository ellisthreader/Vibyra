import { ImageSourcePropType } from "react-native";

export type UsageFrequency = "rarely" | "occasionally" | "few_times_week" | "every_day";
export type BuildIntent = "exploring" | "learning" | "side_project" | "app_website" | "work" | "automation";
export type DeviceMode = "phone_first" | "phone_computer" | "computer_quick_edits" | "other";
export type UsageDepth = "light" | "steady" | "heavy" | "max";
export type BuilderIdentity = "beginner" | "student" | "developer" | "founder_freelancer";
export type Persona =
  | "idea_explorer"
  | "learning_builder"
  | "hobby_builder"
  | "side_project_builder"
  | "app_builder"
  | "workflow_automator"
  | "product_developer"
  | "power_engineer";
export type Plan = "Starter" | "Builder" | "Pro";
export type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type QuizStep = 0 | 1 | 2 | 3 | 4;
export type BillingPeriod = "monthly" | "annual";
export type OnboardingBackdropVariant = "default" | "quiz" | "result";

export type Answers = {
  frequency: UsageFrequency | null;
  intent: BuildIntent[];
  device: DeviceMode | null;
  depth: UsageDepth | null;
  identity: BuilderIdentity | null;
};

export type PersonaModel = {
  name: string;
  description: string;
  recommendedPlan: Plan;
  icon: ImageSourcePropType;
};
