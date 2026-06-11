export type RemoteUser = {
  id: number;
  name: string;
  email: string;
  provider?: "apple" | "google" | "email";
  emailVerified?: boolean;
  plan: string;
  planBillingCycle?: "monthly" | "annual";
  planRenewsAt?: string | null;
  creditsBalance: number;
  creditsUsed: number;
  level?: LevelProgress;
  dailyCreditsUsed?: number;
  dailyCreditsCap?: number;
  dailyCreditsResetAt?: string | null;
  burstCreditsUsed?: number;
  burstCreditsCap?: number;
  burstCreditsResetAt?: string | null;
  burstWindowHours?: number;
  weeklyCreditsUsed?: number;
  weeklyCreditsCap?: number;
  weeklyCreditsResetAt?: string | null;
  monthlyCredits?: number;
  maxConcurrentAgents?: number;
  maxActiveProjects?: number;
  contextTokenCap?: number;
  allowedModelTiers?: string[];
  onboardingComplete: boolean;
  rememberedDesktops: unknown[];
  appState?: Record<string, unknown>;
};

export type LevelProgress = {
  level: number;
  xpTotal: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number;
  dailyXpCap?: number;
  nextReward?: { level: number; credits: number } | null;
  map?: LevelMapNode[];
};

export type LevelMapNode = {
  level: number;
  xpTotalRequired: number;
  rewardCredits: number;
  status: "complete" | "current" | "locked";
};

export type LevelActivityResponse = {
  ok: boolean;
  duplicate?: boolean;
  xpDelta: number;
  levelBefore: number;
  levelAfter: number;
  rewards: { level: number; credits: number }[];
  level: LevelProgress;
  user?: RemoteUser;
};

export type BillingPlan = {
  key: "free" | "starter" | "builder" | "pro";
  label: string;
  monthlyCredits: number;
  annualCredits: number;
  monthlyPricePence: number;
  annualPricePence: number;
  allowedTiers: string[];
  dailyCreditCap: number;
  maxConcurrentAgents: number;
  maxActiveProjects: number;
};

export type BillingTopup = {
  key: string;
  credits: number;
  pricePence: number;
};

export type BillingPlansResponse = {
  ok: true;
  plans: BillingPlan[];
  topups: BillingTopup[];
  currency: string;
  vatInclusive: boolean;
};

export type CheckoutResponse = { ok: true; url: string };
export type IapReceiptResponse = { ok: true; user?: RemoteUser; idempotent?: boolean };

export type ReferralSummary = {
  code: string;
  link: string;
  rewards: {
    referred_signup_credits: number;
    referrer_signup_credits: number;
    referred_paid_credits: number;
    referrer_paid_credits: number;
  };
  stats: {
    signedUp: number;
    paid: number;
    earnedCredits: number;
  };
};

export type ReferralSummaryResponse = {
  ok: true;
  referral: ReferralSummary;
};

export type AuthResponse = {
  ok: boolean;
  token: string;
  user: RemoteUser;
};

export type SessionResponse = {
  ok: boolean;
  user: RemoteUser;
};

export type ChatSkill = {
  id: string;
  slash: string;
  label: string;
  description: string;
  category: string;
  mode: "chat" | "build";
};

export type SkillsResponse = {
  ok: boolean;
  skills: ChatSkill[];
};

export type ChatResponse = {
  ok: boolean;
  reply: string;
  app?: { id: string; title: string; html?: string; projectId?: string; source?: "generated" | "desktop"; url?: string } | null;
  title?: string;
  model: string;
  modelKey?: string;
  chatReference?: string;
  creditCost: number;
  creditsBalance: number;
  creditsUsed: number;
  dailyCreditsUsed?: number;
  dailyCreditsCap?: number;
  levelActivity?: LevelActivityResponse;
  user?: RemoteUser;
};
