import { Ionicons } from "@expo/vector-icons";
import { DashboardPage } from "../types";

export const pages: Array<{ key: DashboardPage; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "dashboard", label: "Dashboard", icon: "grid-outline" },
  { key: "projects", label: "Projects", icon: "folder-open-outline" },
  { key: "chat", label: "AI Chat", icon: "chatbubble-ellipses-outline" },
  { key: "community", label: "Community", icon: "people-outline" },
  { key: "profile", label: "Profile", icon: "person-circle-outline" }
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

export const chatSuggestions = [
  { description: "Find & resolve\nissues", icon: "construct-outline" as const, prompt: "Find and fix the main bug in this project.", title: "Fix a bug" },
  { description: "Add something\nnew", icon: "cube-outline" as const, prompt: "Build a new feature for this project.", title: "Build a feature" },
  { description: "Improve code\nquality", icon: "code-slash-outline" as const, prompt: "Refactor this project and improve the code quality.", title: "Refactor code" },
  { description: "Prepare and\ndeploy", icon: "rocket-outline" as const, prompt: "Prepare this project to ship.", title: "Ship it" }
];
