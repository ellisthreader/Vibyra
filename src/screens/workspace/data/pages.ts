import { Ionicons } from "@expo/vector-icons";
import { DashboardPage } from "../types";

export const pages: Array<{ key: DashboardPage; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "chat", label: "Chat", icon: "chatbubble-ellipses-outline" },
  { key: "projects", label: "Projects", icon: "folder-open-outline" }
];

export const projectStatuses = ["Active", "Draft", "Published"] as const;
export const projectFilterModes = ["All", "PC", "Mobile"] as const;

export const tokenMembership = {
  renewal: "Current cycle"
};

export type PreviousChat = {
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  id: string;
  meta: string;
  running: boolean;
  time: string;
  title: string;
};

export const previousChats: PreviousChat[] = [];

export const buildExamplePrompts: Array<{ icon: keyof typeof Ionicons.glyphMap; label: string; prompt: string }> = [
  { icon: "barbell-outline", label: "Workout tracker", prompt: "Build a workout tracker app where I can log exercises, sets, and reps, and see my progress over time." },
  { icon: "restaurant-outline", label: "Recipe app", prompt: "Build a recipe app where I can save recipes, search by ingredient, and plan meals for the week." },
  { icon: "wallet-outline", label: "Budget tracker", prompt: "Build a budget tracker where I can add expenses, set monthly budgets, and see spending by category." }
];

export const chatSuggestions = [
  { description: "Find & resolve\nissues", icon: "construct-outline" as const, prompt: "Find and fix the main bug in this project.", title: "Fix a bug" },
  { description: "Add something\nnew", icon: "cube-outline" as const, prompt: "Build a new feature for this project.", title: "Build a function" },
  { description: "Improve code\nquality", icon: "code-slash-outline" as const, prompt: "Refactor this project and improve the code quality.", title: "Refactor code" },
  { description: "Prepare and\ndeploy", icon: "rocket-outline" as const, prompt: "Prepare this project to ship.", title: "Ship it" }
];
