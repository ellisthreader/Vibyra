import { useEffect, useRef } from "react";
import { LogEvent, RememberedDesktop } from "../types/domain";
import { appApiRequest } from "../utils/appApi";

const FAILURE_COOLDOWN_MS = 30000;

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

  const nextAttemptAtRef = useRef(0);
  const cooldownLoggedRef = useRef(false);

  useEffect(() => {
    if (!authenticated || !authToken) return undefined;

    const timeout = setTimeout(() => {
      if (Date.now() < nextAttemptAtRef.current) return;

      appApiRequest("/api/session/state", {
        method: "POST",
        body: JSON.stringify({
          onboardingComplete,
          rememberedDesktops: rememberedDesktops.map(({ token, ...desktop }) => desktop),
          appState: { chatThreads, chatTitles, promptMoney, selectedChatModel, selectedModel }
        })
      }, authToken).then(() => {
        nextAttemptAtRef.current = 0;
        cooldownLoggedRef.current = false;
      }).catch(() => {
        nextAttemptAtRef.current = Date.now() + FAILURE_COOLDOWN_MS;
        if (!cooldownLoggedRef.current) {
          cooldownLoggedRef.current = true;
          logs.appendLog("Saved locally. Cloud sync will retry when the API is reachable.", "Account", "warning");
        }
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
