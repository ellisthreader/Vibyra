import { ImageSourcePropType } from "react-native";
import { BillingPeriod, Plan } from "../types";

export const plans: Array<{
  name: Plan;
  monthlyPrice: string;
  yearlyPrice: string;
  yearlySaving: string;
  effectiveMonthly: string;
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
    monthlyPrice: "£20 / month",
    yearlyPrice: "£225 / year",
    yearlySaving: "Save £15",
    effectiveMonthly: "£18.75/month",
    targetUser: "Casual builders",
    generations: "350 credits/month (up to $3.50 of AI)",
    modelAccess: "All models (premium burns faster)",
    limits: "1 active project, 1 agent at a time",
    estimatedCost: "£3-£4",
    profitMargin: "60%+ conservative contribution margin",
    summary: "For testing ideas and shipping small builds.",
    features: [
      "350 monthly credits on monthly or annual billing",
      "All AI models supported",
      "1 active project, 1 agent at a time",
      "Daily soft-cap protects your budget",
      "Top-up credits any time"
    ],
    icon: require("../../../assets/plan-icons/starter.png")
  },
  {
    name: "Builder",
    monthlyPrice: "£49 / month",
    yearlyPrice: "£585 / year",
    yearlySaving: "Save £3",
    effectiveMonthly: "£48.75/month",
    targetUser: "Regular builders",
    generations: "1,000 credits/month (up to $10 of AI)",
    modelAccess: "All models (premium burns faster)",
    limits: "3 active projects, 2 agents at a time",
    estimatedCost: "£8-£10",
    profitMargin: "60%+ conservative contribution margin",
    summary: "The main plan for ongoing apps, websites, and tools.",
    features: [
      "1,000 monthly credits on monthly or annual billing",
      "Access to premium models",
      "3 active projects, 2 agents at a time",
      "Higher daily cap and rate limits",
      "Priority queue when busy"
    ],
    icon: require("../../../assets/plan-icons/builder.png")
  },
  {
    name: "Pro",
    monthlyPrice: "£99 / month",
    yearlyPrice: "£1,170 / year",
    yearlySaving: "Save £18",
    effectiveMonthly: "£97.50/month",
    targetUser: "Power users / agencies",
    generations: "2,000 credits/month (up to $20 of AI)",
    modelAccess: "All models with priority routing",
    limits: "10 active projects, 4 agents at a time",
    estimatedCost: "£17-£20",
    profitMargin: "60%+ conservative contribution margin",
    summary: "For heavy coding sessions and multi-agent workflows.",
    features: [
      "2,000 monthly credits on monthly or annual billing",
      "All models, priority routing",
      "10 projects, 4 concurrent agents",
      "Highest daily cap, fewest rate limits",
      "Long-context requests supported"
    ],
    icon: require("../../../assets/plan-icons/pro.png")
  }
];

export const membershipProductIds: Record<Plan, Record<BillingPeriod, string>> = {
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

export const membershipSkus = Object.values(membershipProductIds).flatMap((periods) => Object.values(periods));

export const planKeyMap: Record<Plan, "starter" | "builder" | "pro"> = {
  Starter: "starter",
  Builder: "builder",
  Pro: "pro"
};

export const topupProductIds = {
  topup_500: "app.vibyra.topup.500",
  topup_1500: "app.vibyra.topup.1500",
  topup_4000: "app.vibyra.topup.4000"
} as const;

export const topupSkus = Object.values(topupProductIds);
