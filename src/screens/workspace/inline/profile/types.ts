import { Ionicons } from "@expo/vector-icons";

export type SheetKind =
  | "edit" | "billing" | "usage" | "refer" | "notifications" | "appearance"
  | "security" | "language" | "help" | "support" | "terms" | "logout";

export type AppearanceMode = "dark" | "auto" | "light";

export type PlanKey = "free" | "starter" | "builder" | "pro";

export type BillingCycle = "monthly" | "annual";

export type PlanTier = {
  key: PlanKey;
  name: string;
  tagline: string;
  price: string;
  cadence: string;
  annualPrice: string;
  annualCadence: string;
  annualSubtext?: string;
  annualTokens?: string;
  tokens: string;
  highlight?: string;
  perks: string[];
  badge?: string;
  pillIcon: keyof typeof Ionicons.glyphMap;
  pillIconColor: string;
  pillIconBg: string;
};

export const PLAN_TIERS: PlanTier[] = [
  { key: "free", name: "Free", tagline: "Tinker & try things out",
    price: "£0", cadence: "forever",
    annualPrice: "£0", annualCadence: "forever",
    tokens: "50 credits / month",
    perks: ["Free + budget models only", "1 active project", "Community access"],
    pillIcon: "leaf", pillIconColor: "#4ADE80", pillIconBg: "rgba(74, 222, 128, 0.16)" },
  { key: "starter", name: "Starter", tagline: "Ship your first real build",
    price: "£19", cadence: "per month",
    annualPrice: "£190", annualCadence: "per year",
    annualSubtext: "£15.83/mo · save £38",
    tokens: "500 credits / month", annualTokens: "550 credits / month",
    perks: ["All AI models supported", "1 active project, 1 agent", "Daily soft cap protects your budget", "+10% credits on annual billing"],
    pillIcon: "rocket", pillIconColor: "#C259FF", pillIconBg: "rgba(139, 53, 255, 0.22)" },
  { key: "builder", name: "Builder", tagline: "Daily building, no ceilings",
    price: "£49", cadence: "per month",
    annualPrice: "£490", annualCadence: "per year",
    annualSubtext: "£40.83/mo · save £98",
    tokens: "1,800 credits / month", annualTokens: "1,980 credits / month",
    badge: "Most popular",
    highlight: "Save £98/year on annual",
    perks: ["All models (premium burns faster)", "3 projects, 2 agents at once", "Priority queue when busy", "+10% credits on annual billing"],
    pillIcon: "briefcase", pillIconColor: "#C259FF", pillIconBg: "rgba(139, 53, 255, 0.22)" },
  { key: "pro", name: "Pro", tagline: "Multi-agent power-user workflows",
    price: "£99", cadence: "per month",
    annualPrice: "£990", annualCadence: "per year",
    annualSubtext: "£82.50/mo · save £198",
    tokens: "4,500 credits / month", annualTokens: "4,950 credits / month",
    perks: ["All models, priority routing", "10 projects, 4 concurrent agents", "Highest daily cap, fewest rate limits", "+10% credits on annual billing"],
    pillIcon: "trophy", pillIconColor: "#FACC15", pillIconBg: "rgba(250, 204, 21, 0.18)" }
];

export const PLAN_ORDER: PlanKey[] = ["free", "starter", "builder", "pro"];

export const LANGUAGES = ["English", "Español", "Français", "Deutsch", "日本語", "中文", "Português"];

export const APPEARANCE_OPTIONS: Array<{ key: AppearanceMode; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "dark", title: "Dark", subtitle: "Vibyra signature look", icon: "moon-outline" },
  { key: "auto", title: "Auto", subtitle: "Match system appearance", icon: "contrast-outline" },
  { key: "light", title: "Light", subtitle: "High-contrast daytime", icon: "sunny-outline" }
];

export const FAQS: Array<{ q: string; a: string }> = [
  { q: "What are tokens?", a: "Tokens cover AI usage across builds and chats. Faster models cost more tokens per request." },
  { q: "How do I connect my desktop?", a: "Open the Vibyra desktop app and use the QR or pairing code from the PC switcher in the header." },
  { q: "Where are my projects stored?", a: "Project metadata syncs to your account; source files stay on the desktop folder you adopted." },
  { q: "Can I cancel anytime?", a: "Yes — cancel under Billing & subscription. You keep access until the end of the current cycle." }
];

export const PROFILE_ROW_TO_SHEET: Record<string, SheetKind> = {
  "Profile information": "edit",
  "Billing & subscription": "billing",
  "Usage & history": "usage",
  "Refer & earn": "refer",
  Notifications: "notifications",
  Appearance: "appearance",
  "Privacy & security": "security",
  Language: "language",
  "Help center": "help",
  "Contact support": "support",
  "Terms of service": "terms",
  "Log out": "logout"
};

export function appearanceLabel(mode: AppearanceMode) {
  if (mode === "auto") return "Auto";
  if (mode === "light") return "Light";
  return "Dark";
}

export function tierCompare(a: PlanKey, b: PlanKey) {
  return PLAN_ORDER.indexOf(a) - PLAN_ORDER.indexOf(b);
}

export function nextRecommendedTier(current: PlanKey): PlanKey {
  if (current === "pro") return "pro";
  return PLAN_ORDER[Math.min(PLAN_ORDER.indexOf(current) + 1, PLAN_ORDER.length - 1)];
}
