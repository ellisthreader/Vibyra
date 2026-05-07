import {
  Answers,
  BuildIntent,
  DeviceMode,
  OnboardingStep,
  Persona,
  Plan
} from "./types";
import { colors } from "../../styles/theme";

export function calculatePersona(answers: Answers): Persona {
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

export function canContinueFromStep(step: OnboardingStep, answers: Answers) {
  if (step === 0) return Boolean(answers.frequency);
  if (step === 1) return answers.intent.length > 0;
  if (step === 2) return Boolean(answers.device);
  if (step === 3) return Boolean(answers.depth);
  return true;
}

export function getMomentContent(answers: Answers) {
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

export function getPlanTheme(plan: Plan): {
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

export function getPlanMotionValue(plan: Plan) {
  if (plan === "Starter") return 0;
  if (plan === "Pro") return 2;
  return 1;
}
