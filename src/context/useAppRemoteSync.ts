import { AppContextValue } from "./appContextTypes";
import { useCloudSync } from "./useCloudSync";
import { useSessionValidation } from "./useSessionValidation";

type RemoteSyncState = Pick<AppContextValue,
  "authenticated" | "authToken" | "persistenceReady" | "onboardingComplete" |
  "rememberedDesktops" | "chatThreads" | "chatTitles" | "chatProjects" |
  "promptMoney" | "selectedChatModel" | "selectedModel"
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
    chatProjects: state.chatProjects,
    promptMoney: state.promptMoney,
    selectedChatModel: state.selectedChatModel,
    selectedModel: state.selectedModel
  }, logs, expireAiSession);

  useSessionValidation({
    persistenceReady: state.persistenceReady,
    authenticated: state.authenticated,
    authToken: state.authToken,
    applyRemoteUser: auth.applyRemoteUserFromIap,
    expireSession: auth.expireSession
  });
}
