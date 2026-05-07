import { ImageSourcePropType } from "react-native";
import { BillingPeriod, Plan } from "../types";

export const plans: Array<{
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
    icon: require("../../../assets/plan-icons/starter.png")
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
    icon: require("../../../assets/plan-icons/builder.png")
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
