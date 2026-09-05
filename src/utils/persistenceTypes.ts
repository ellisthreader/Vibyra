import type { RememberedDesktop } from "../types/domain";
import type { LevelProgress } from "./appApiTypes";

export type PersistedSession = {
  authToken: string;
  installId: string;
  onboardingComplete: boolean;
  pcSetupComplete: boolean;
  pcSetupSkipped: boolean;
  selectedChatModel: string;
  rememberedDesktops: RememberedDesktop[];
  user: PersistedUser | null;
};

export type PersistedUser = {
  id: number;
  name: string;
  email: string;
  plan: string;
  planBillingCycle: "monthly" | "annual";
  planRenewsAt: string | null;
  creditsBalance: number;
  creditsUsed: number;
  dailyCreditsUsed: number;
  dailyCreditsCap: number;
  dailyCreditsResetAt: string | null;
  burstCreditsUsed: number;
  burstCreditsCap: number;
  burstCreditsResetAt: string | null;
  burstWindowHours: number;
  weeklyCreditsUsed: number;
  weeklyCreditsCap: number;
  weeklyCreditsResetAt: string | null;
  monthlyCredits: number;
  allowedModelTiers: string[];
  level?: LevelProgress;
  onboardingComplete: boolean;
  rememberedDesktops: RememberedDesktop[];
  appState?: Record<string, unknown>;
};
