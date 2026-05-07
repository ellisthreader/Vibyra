import { Ionicons } from "@expo/vector-icons";
import { DashboardPage } from "../types";

export const pages: Array<{ key: DashboardPage; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "dashboard", label: "Dashboard", icon: "grid-outline" },
  { key: "projects", label: "Projects", icon: "folder-open-outline" },
  { key: "chat", label: "AI Chat", icon: "chatbubble-ellipses-outline" },
  { key: "community", label: "Community", icon: "people-outline" },
  { key: "profile", label: "Profile", icon: "person-circle-outline" }
];

export const projectStatuses = ["Active", "Draft", "Completed"] as const;
export const projectFilterModes = ["All", "PC", "Mobile"] as const;

export const tokenMembership = {
  allowance: 1500,
  balance: 1240,
  bonusTokens: 200,
  modelAccess: "Efficient models",
  nextPlan: "Builder",
  plan: "Starter",
  renewal: "Renews monthly",
  used: 260
};

export const previousChats = [
  { detail: "Edited hero.tsx", icon: "chatbubble-ellipses-outline" as const, id: "landing-polish", meta: "Current chat", running: true, time: "2 mins ago", title: "Landing page polish" },
  { detail: "Investigating login issue", icon: "bug-outline" as const, id: "auth-bug", meta: "Saved 2d ago", running: false, time: "2d ago", title: "Fix auth bug" },
  { detail: "Refactoring components", icon: "chatbubble-ellipses-outline" as const, id: "pricing-page", meta: "Saved 5d ago", running: false, time: "5d ago", title: "SaaS pricing page" },
  { detail: "Optimising queries", icon: "bug-outline" as const, id: "database-optimisation", meta: "Saved 1w ago", running: true, time: "1w ago", title: "Database optimisation" }
];

export const chatSuggestions = [
  { description: "Find & resolve\nissues", icon: "construct-outline" as const, title: "Fix a bug" },
  { description: "Add something\nnew", icon: "cube-outline" as const, title: "Build a feature" },
  { description: "Improve code\nquality", icon: "code-slash-outline" as const, title: "Refactor code" },
  { description: "Prepare and\ndeploy", icon: "rocket-outline" as const, title: "Ship it" }
];
