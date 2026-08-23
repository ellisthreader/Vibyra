import React, { createContext, PropsWithChildren, useContext, useMemo, useRef, useCallback } from "react";
import type { AppContextValue } from "./appContextTypes";

type AccountSessionValue = Pick<AppContextValue,
  "persistenceReady" | "authenticated" | "authToken" | "accountId" | "authMode" | "authName" |
  "authEmail" | "authPassword" | "authReferralCode" | "profileImageUri" | "onboardingComplete" |
  "pcSetupComplete" | "pcSetupSkipped"
>;
type AccountUsageValue = Pick<AppContextValue,
  "accountPlan" | "levelProgress" | "creditsBalance" | "creditsUsed" | "dailyCreditsUsed" |
  "dailyCreditsCap" | "dailyCreditsResetAt" | "burstCreditsUsed" | "burstCreditsCap" |
  "burstCreditsResetAt" | "burstWindowHours" | "weeklyCreditsUsed" | "weeklyCreditsCap" |
  "weeklyCreditsResetAt"
>;
type AccountActionsValue = Pick<AppContextValue,
  "authenticateWith" | "completeOnboarding" | "completePcSetup" | "skipPcSetup" |
  "applyRemoteUserFromIap" | "applyRemoteUsage" | "clearCache" | "deleteAccount" |
  "expireSession" | "signOut" | "updateProfile" | "setAuthMode" | "setAuthName" |
  "setAuthEmail" | "setAuthPassword" | "setAuthReferralCode"
>;

const AccountSessionContext = createContext<AccountSessionValue | null>(null);
const AccountUsageContext = createContext<AccountUsageValue | null>(null);
const AccountActionsContext = createContext<AccountActionsValue | null>(null);

export function AccountContextProviders({ app, children }: PropsWithChildren<{ app: AppContextValue }>) {
  const session = useMemo<AccountSessionValue>(() => ({
    persistenceReady: app.persistenceReady, authenticated: app.authenticated, authToken: app.authToken,
    accountId: app.accountId, authMode: app.authMode, authName: app.authName, authEmail: app.authEmail,
    authPassword: app.authPassword, authReferralCode: app.authReferralCode, profileImageUri: app.profileImageUri,
    onboardingComplete: app.onboardingComplete, pcSetupComplete: app.pcSetupComplete, pcSetupSkipped: app.pcSetupSkipped
  }), [app.persistenceReady, app.authenticated, app.authToken, app.accountId, app.authMode, app.authName,
    app.authEmail, app.authPassword, app.authReferralCode, app.profileImageUri, app.onboardingComplete,
    app.pcSetupComplete, app.pcSetupSkipped]);
  const usage = useMemo<AccountUsageValue>(() => ({
    accountPlan: app.accountPlan, levelProgress: app.levelProgress, creditsBalance: app.creditsBalance,
    creditsUsed: app.creditsUsed, dailyCreditsUsed: app.dailyCreditsUsed, dailyCreditsCap: app.dailyCreditsCap,
    dailyCreditsResetAt: app.dailyCreditsResetAt, burstCreditsUsed: app.burstCreditsUsed,
    burstCreditsCap: app.burstCreditsCap, burstCreditsResetAt: app.burstCreditsResetAt,
    burstWindowHours: app.burstWindowHours, weeklyCreditsUsed: app.weeklyCreditsUsed,
    weeklyCreditsCap: app.weeklyCreditsCap, weeklyCreditsResetAt: app.weeklyCreditsResetAt
  }), [app.accountPlan, app.levelProgress, app.creditsBalance, app.creditsUsed, app.dailyCreditsUsed,
    app.dailyCreditsCap, app.dailyCreditsResetAt, app.burstCreditsUsed, app.burstCreditsCap,
    app.burstCreditsResetAt, app.burstWindowHours, app.weeklyCreditsUsed, app.weeklyCreditsCap,
    app.weeklyCreditsResetAt]);
  const actions: AccountActionsValue = {
    authenticateWith: useStableAction(app.authenticateWith), completeOnboarding: useStableAction(app.completeOnboarding),
    completePcSetup: useStableAction(app.completePcSetup), skipPcSetup: useStableAction(app.skipPcSetup),
    applyRemoteUserFromIap: useStableAction(app.applyRemoteUserFromIap), applyRemoteUsage: useStableAction(app.applyRemoteUsage),
    clearCache: useStableAction(app.clearCache), deleteAccount: useStableAction(app.deleteAccount),
    expireSession: useStableAction(app.expireSession), signOut: useStableAction(app.signOut),
    updateProfile: useStableAction(app.updateProfile), setAuthMode: useStableAction(app.setAuthMode),
    setAuthName: useStableAction(app.setAuthName), setAuthEmail: useStableAction(app.setAuthEmail),
    setAuthPassword: useStableAction(app.setAuthPassword), setAuthReferralCode: useStableAction(app.setAuthReferralCode)
  };
  const stableActions = useMemo(() => actions, Object.values(actions));
  return <AccountSessionContext.Provider value={session}><AccountUsageContext.Provider value={usage}>
    <AccountActionsContext.Provider value={stableActions}>{children}</AccountActionsContext.Provider>
  </AccountUsageContext.Provider></AccountSessionContext.Provider>;
}

function useStableAction<T extends (...args: never[]) => unknown>(action: T): T {
  const current = useRef(action);
  current.current = action;
  return useCallback(((...args: Parameters<T>) => current.current(...args)) as T, []);
}
function requiredContext<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} must be used inside AppProvider`);
  return value;
}
export const useAccountSession = () => requiredContext(useContext(AccountSessionContext), "useAccountSession");
export const useAccountUsage = () => requiredContext(useContext(AccountUsageContext), "useAccountUsage");
export const useAccountActions = () => requiredContext(useContext(AccountActionsContext), "useAccountActions");
