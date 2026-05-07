import { useEffect } from "react";
import { LogEvent, RememberedDesktop } from "../types/domain";
import { appApiRequest } from "../utils/appApi";

type Setters = {
  setOnboardingComplete: (value: boolean) => void;
};
type Logs = {
  appendLog: (message: string, source?: string, tone?: LogEvent["tone"]) => void;
};

type Snapshot = {
  authenticated: boolean;
  authToken: string;
  onboardingComplete: boolean;
  rememberedDesktops: RememberedDesktop[];
  chatThreads: unknown;
  chatTitles: unknown;
  promptMoney: unknown;
  selectedChatModel: string;
  selectedModel: string;
};

export function useCloudSync(snapshot: Snapshot, logs: Logs) {
  const {
    authenticated,
    authToken,
    onboardingComplete,
    rememberedDesktops,
    chatThreads,
    chatTitles,
    promptMoney,
    selectedChatModel,
    selectedModel
  } = snapshot;

  useEffect(() => {
    if (!authenticated || !authToken) return undefined;

    const timeout = setTimeout(() => {
      appApiRequest("/api/session/state", {
        method: "POST",
        body: JSON.stringify({
          onboardingComplete,
          rememberedDesktops,
          appState: { chatThreads, chatTitles, promptMoney, selectedChatModel, selectedModel }
        })
      }, authToken).catch(() => {
        logs.appendLog("Saved locally. Cloud sync will retry when the API is reachable.", "Account", "warning");
      });
    }, 700);

    return () => clearTimeout(timeout);
  }, [
    logs,
    authToken,
    authenticated,
    chatThreads,
    chatTitles,
    onboardingComplete,
    promptMoney,
    rememberedDesktops,
    selectedChatModel,
    selectedModel
  ]);
}
