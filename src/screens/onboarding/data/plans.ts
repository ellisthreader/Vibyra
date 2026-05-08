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
    monthlyPrice: "£19 / month",
    yearlyPrice: "£190 / year",
    yearlySaving: "Save £38 (2 months free)",
    effectiveMonthly: "£15.83/month",
    targetUser: "Casual builders",
    generations: "500 credits/month (≈ $5 of AI)",
    modelAccess: "Budget + balanced models",
    limits: "1 active project, 1 agent at a time",
    estimatedCost: "£3-£4",
    profitMargin: "60-70%",
    summary: "For testing ideas and shipping small builds.",
    features: [
      "500 monthly credits (550 on annual)",
      "Budget + balanced AI models",
      "1 active project, 1 agent at a time",
      "Daily soft-cap protects your budget",
      "Top-up credits any time"
    ],
    icon: require("../../../assets/plan-icons/starter.png")
  },
  {
    name: "Builder",
    monthlyPrice: "£49 / month",
    yearlyPrice: "£490 / year",
    yearlySaving: "Save £98 (2 months free + 10% credits)",
    effectiveMonthly: "£40.83/month",
    targetUser: "Regular builders",
    generations: "1,800 credits/month (≈ $18 of AI)",
    modelAccess: "All models (premium burns faster)",
    limits: "3 active projects, 2 agents at a time",
    estimatedCost: "£12-£14",
    profitMargin: "55-65%",
    summary: "The main plan for ongoing apps, websites, and tools.",
    features: [
      "1,800 monthly credits (1,980 on annual)",
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
    yearlyPrice: "£990 / year",
    yearlySaving: "Save £198 (2 months free + 10% credits)",
    effectiveMonthly: "£82.50/month",
    targetUser: "Power users / agencies",
    generations: "4,500 credits/month (≈ $45 of AI)",
    modelAccess: "All models with priority routing",
    limits: "10 active projects, 4 agents at a time",
    estimatedCost: "£30-£40",
    profitMargin: "40-50%",
    summary: "For heavy coding sessions and multi-agent workflows.",
    features: [
      "4,500 monthly credits (4,950 on annual)",
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
