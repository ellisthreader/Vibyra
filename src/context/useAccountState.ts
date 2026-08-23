import { useState } from "react";
import type { PersistedSession } from "../utils/persistence";
import type { getPersistedAppState } from "./appStatePersistence";

type AppSnapshot = ReturnType<typeof getPersistedAppState>;

export function useAccountState(session: PersistedSession, app: AppSnapshot) {
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(Boolean(session.authToken && session.user));
  const [authToken, setAuthToken] = useState(session.authToken);
  const [installId, setInstallId] = useState(session.installId);
  const [accountId, setAccountId] = useState<number | null>(session.user?.id ?? null);
  const [accountPlan, setAccountPlan] = useState(session.user?.plan ?? "free");
  const [levelProgress, setLevelProgress] = useState(session.user?.level);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [authName, setAuthName] = useState(session.user?.name ?? "");
  const [authEmail, setAuthEmail] = useState(session.user?.email ?? "");
  const [authPassword, setAuthPassword] = useState("");
  const [authReferralCode, setAuthReferralCode] = useState("");
  const [profileImageUri, setProfileImageUri] = useState(app.profileImageUri);
  const [creditsBalance, setCreditsBalance] = useState(session.user?.creditsBalance ?? 0);
  const [creditsUsed, setCreditsUsed] = useState(session.user?.creditsUsed ?? 0);
  const [dailyCreditsUsed, setDailyCreditsUsed] = useState(session.user?.dailyCreditsUsed ?? 0);
  const [dailyCreditsCap, setDailyCreditsCap] = useState(session.user?.dailyCreditsCap ?? 0);
  const [dailyCreditsResetAt, setDailyCreditsResetAt] = useState<string | null>(session.user?.dailyCreditsResetAt ?? null);
  const [burstCreditsUsed, setBurstCreditsUsed] = useState(session.user?.burstCreditsUsed ?? 0);
  const [burstCreditsCap, setBurstCreditsCap] = useState(session.user?.burstCreditsCap ?? 0);
  const [burstCreditsResetAt, setBurstCreditsResetAt] = useState<string | null>(session.user?.burstCreditsResetAt ?? null);
  const [burstWindowHours, setBurstWindowHours] = useState(session.user?.burstWindowHours ?? 5);
  const [weeklyCreditsUsed, setWeeklyCreditsUsed] = useState(session.user?.weeklyCreditsUsed ?? 0);
  const [weeklyCreditsCap, setWeeklyCreditsCap] = useState(session.user?.weeklyCreditsCap ?? 0);
  const [weeklyCreditsResetAt, setWeeklyCreditsResetAt] = useState<string | null>(session.user?.weeklyCreditsResetAt ?? null);
  const [onboardingComplete, setOnboardingComplete] = useState(session.onboardingComplete);
  const [pcSetupComplete, setPcSetupComplete] = useState(session.pcSetupComplete);
  const [pcSetupSkipped, setPcSetupSkipped] = useState(session.pcSetupSkipped);

  return {
    state: { persistenceReady, authenticated, authToken, installId, accountId, accountPlan, levelProgress,
      authMode, authName, authEmail, authPassword, authReferralCode, profileImageUri, creditsBalance, creditsUsed,
      dailyCreditsUsed, dailyCreditsCap, dailyCreditsResetAt, burstCreditsUsed, burstCreditsCap, burstCreditsResetAt,
      burstWindowHours, weeklyCreditsUsed, weeklyCreditsCap, weeklyCreditsResetAt, onboardingComplete, pcSetupComplete, pcSetupSkipped },
    setters: { setPersistenceReady, setAuthenticated, setAuthToken, setInstallId, setAccountId, setAccountPlan,
      setLevelProgress, setAuthMode, setAuthName, setAuthEmail, setAuthPassword, setAuthReferralCode,
      setProfileImageUri, setCreditsBalance, setCreditsUsed, setDailyCreditsUsed, setDailyCreditsCap,
      setDailyCreditsResetAt, setBurstCreditsUsed, setBurstCreditsCap, setBurstCreditsResetAt, setBurstWindowHours,
      setWeeklyCreditsUsed, setWeeklyCreditsCap, setWeeklyCreditsResetAt, setOnboardingComplete, setPcSetupComplete, setPcSetupSkipped }
  };
}
