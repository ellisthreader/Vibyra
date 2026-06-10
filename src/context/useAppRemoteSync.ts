import { AppContextValue } from "./appContextTypes";
import { useCloudSync } from "./useCloudSync";
import { useSessionValidation } from "./useSessionValidation";

type RemoteSyncState = Pick<AppContextValue,
  "authenticated" | "authToken" | "installId" | "persistenceReady" | "onboardingComplete" |
  "rememberedDesktops" | "chatThreads" | "chatTitles" | "detachedChatThreads" | "detachedChatTitles" | "detachedChatUpdatedAt" | "chatProjects" |
  "projectMemories" | "editApprovals" | "promptMoney" | "desktopPermissionMode" | "selectedChatModel" | "selectedModel"
>;

type AuthActions = Pick<AppContextValue, "applyRemoteUserFromIap" | "expireSession">;

export function useAppRemoteSync(state: RemoteSyncState, logs: Parameters<typeof useCloudSync>[1], auth: AuthActions) {
  const expireAiSession = () => auth.expireSession("Your Vibyra login needs refreshing before AI chat can continue.");

  useCloudSync({
    authenticated: state.authenticated,
    authToken: state.authToken,
    onboardingComplete: state.onboardingComplete,
    rememberedDesktops: state.rememberedDesktops,
    chatThreads: state.chatThreads,
    chatTitles: state.chatTitles,
    detachedChatThreads: state.detachedChatThreads,
    detachedChatTitles: state.detachedChatTitles,
    detachedChatUpdatedAt: state.detachedChatUpdatedAt,
    chatProjects: state.chatProjects,
    projectMemories: state.projectMemories,
    editApprovals: state.editApprovals,
    promptMoney: state.promptMoney,
    desktopPermissionMode: state.desktopPermissionMode,
    selectedChatModel: state.selectedChatModel,
    selectedModel: state.selectedModel
  }, logs, expireAiSession);

  useSessionValidation({
    persistenceReady: state.persistenceReady,
    authenticated: state.authenticated,
    authToken: state.authToken,
    installId: state.installId,
    applyRemoteUser: auth.applyRemoteUserFromIap,
    expireSession: auth.expireSession
  });
}
