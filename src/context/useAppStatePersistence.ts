import { useEffect } from "react";
import { loadPersistedSession, savePersistedSession } from "../utils/persistence";
import { createPersistableAppState, getPersistedAppState } from "./appStatePersistence";
import type { useAccountState } from "./useAccountState";
import type { useChatState } from "./useChatState";
import type { useDesktopState } from "./useDesktopState";
import type { useWorkspaceRuntimeState } from "./useWorkspaceRuntimeState";

type Account = ReturnType<typeof useAccountState>;
type Desktop = ReturnType<typeof useDesktopState>;
type Workspace = ReturnType<typeof useWorkspaceRuntimeState>;
type Chat = ReturnType<typeof useChatState>;

export function useAppStatePersistence(account: Account, desktop: Desktop, workspace: Workspace, chat: Chat) {
  useHydratePersistedState(account, desktop, workspace, chat);
  useSavePersistedState(account.state, desktop.state, workspace.state, chat.state);
}

function useHydratePersistedState(account: Account, desktop: Desktop, workspace: Workspace, chat: Chat) {
  useEffect(() => {
    let cancelled = false;
    loadPersistedSession().then((session) => {
      if (cancelled) return;
      const app = getPersistedAppState(session);
      const a = account.setters;
      a.setAuthenticated(Boolean(session.authToken && session.user));
      a.setAuthToken(session.authToken);
      a.setInstallId(session.installId);
      a.setAccountId(session.user?.id ?? null);
      a.setAccountPlan(session.user?.plan ?? "free");
      a.setLevelProgress(session.user?.level);
      a.setAuthName(session.user?.name ?? "");
      a.setAuthEmail(session.user?.email ?? "");
      a.setProfileImageUri(app.profileImageUri);
      a.setCreditsBalance(session.user?.creditsBalance ?? 0);
      a.setCreditsUsed(session.user?.creditsUsed ?? 0);
      a.setDailyCreditsUsed(session.user?.dailyCreditsUsed ?? 0);
      a.setDailyCreditsCap(session.user?.dailyCreditsCap ?? 0);
      a.setDailyCreditsResetAt(session.user?.dailyCreditsResetAt ?? null);
      a.setBurstCreditsUsed(session.user?.burstCreditsUsed ?? 0);
      a.setBurstCreditsCap(session.user?.burstCreditsCap ?? 0);
      a.setBurstCreditsResetAt(session.user?.burstCreditsResetAt ?? null);
      a.setBurstWindowHours(session.user?.burstWindowHours ?? 5);
      a.setWeeklyCreditsUsed(session.user?.weeklyCreditsUsed ?? 0);
      a.setWeeklyCreditsCap(session.user?.weeklyCreditsCap ?? 0);
      a.setWeeklyCreditsResetAt(session.user?.weeklyCreditsResetAt ?? null);
      a.setOnboardingComplete(session.onboardingComplete);
      a.setPcSetupComplete(session.pcSetupComplete);
      a.setPcSetupSkipped(session.pcSetupSkipped);
      desktop.setters.setRememberedDesktops(session.rememberedDesktops);
      desktop.setters.setDesktopPermissionMode(app.desktopPermissionMode);
      workspace.setters.setSelectedChatModel(session.selectedChatModel);
      workspace.setters.setSelectedModel(app.selectedModel);
      chat.hydration.setChatThreadsState(app.chatThreads);
      chat.setters.setChatTitles(app.chatTitles);
      chat.hydration.setDetachedChatThreadsState(app.detachedChatThreads);
      chat.setters.setDetachedChatTitles(app.detachedChatTitles);
      chat.setters.setDetachedChatUpdatedAt(app.detachedChatUpdatedAt);
      chat.setters.setChatProjects(app.chatProjects);
      chat.setters.setProjectMemories(app.projectMemories);
      chat.setters.setEditApprovals(app.editApprovals);
      chat.setters.setPromptMoney(app.promptMoney);
    }).finally(() => {
      if (!cancelled) account.setters.setPersistenceReady(true);
    });
    return () => { cancelled = true; };
  }, []);
}

function useSavePersistedState(
  account: Account["state"], desktop: Desktop["state"], workspace: Workspace["state"], chat: Chat["state"]
) {
  useEffect(() => {
    if (!account.persistenceReady) return;
    const appState = createPersistableAppState({
      chatThreads: chat.chatThreads, chatTitles: chat.chatTitles,
      detachedChatThreads: chat.detachedChatThreads, detachedChatTitles: chat.detachedChatTitles,
      detachedChatUpdatedAt: chat.detachedChatUpdatedAt, chatProjects: chat.chatProjects,
      projectMemories: chat.projectMemories, editApprovals: chat.editApprovals,
      profileImageUri: account.profileImageUri, selectedModel: workspace.selectedModel,
      selectedChatModel: workspace.selectedChatModel, desktopPermissionMode: desktop.desktopPermissionMode,
      promptMoney: chat.promptMoney
    });
    void savePersistedSession({
      authToken: account.authToken,
      installId: account.installId,
      onboardingComplete: account.onboardingComplete,
      pcSetupComplete: account.pcSetupComplete,
      pcSetupSkipped: account.pcSetupSkipped,
      selectedChatModel: workspace.selectedChatModel,
      rememberedDesktops: desktop.rememberedDesktops,
      user: account.accountId ? {
        id: account.accountId, name: account.authName || "Vibyra User", email: account.authEmail,
        plan: account.accountPlan, planBillingCycle: "monthly", planRenewsAt: null,
        creditsBalance: account.creditsBalance, creditsUsed: account.creditsUsed,
        dailyCreditsUsed: account.dailyCreditsUsed, dailyCreditsCap: account.dailyCreditsCap,
        dailyCreditsResetAt: account.dailyCreditsResetAt, burstCreditsUsed: account.burstCreditsUsed,
        burstCreditsCap: account.burstCreditsCap, burstCreditsResetAt: account.burstCreditsResetAt,
        burstWindowHours: account.burstWindowHours, weeklyCreditsUsed: account.weeklyCreditsUsed,
        weeklyCreditsCap: account.weeklyCreditsCap, weeklyCreditsResetAt: account.weeklyCreditsResetAt,
        monthlyCredits: 0, allowedModelTiers: [], level: account.levelProgress,
        onboardingComplete: account.onboardingComplete, rememberedDesktops: desktop.rememberedDesktops, appState
      } : null
    });
  }, [
    account.accountId, account.accountPlan, account.authEmail, account.authName, account.authToken,
    account.creditsBalance, account.creditsUsed, account.dailyCreditsUsed, account.dailyCreditsCap,
    account.dailyCreditsResetAt, account.burstCreditsUsed, account.burstCreditsCap, account.burstCreditsResetAt,
    account.burstWindowHours, account.weeklyCreditsUsed, account.weeklyCreditsCap, account.weeklyCreditsResetAt,
    account.installId, account.levelProgress, account.onboardingComplete, account.pcSetupComplete,
    account.pcSetupSkipped, account.persistenceReady, account.profileImageUri,
    desktop.desktopPermissionMode, desktop.rememberedDesktops,
    workspace.selectedChatModel, workspace.selectedModel,
    chat.chatThreads, chat.chatTitles, chat.detachedChatThreads, chat.detachedChatTitles,
    chat.detachedChatUpdatedAt, chat.chatProjects, chat.projectMemories, chat.editApprovals, chat.promptMoney
  ]);
}
