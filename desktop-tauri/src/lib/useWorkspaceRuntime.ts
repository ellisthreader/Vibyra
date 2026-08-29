import { useEffect } from "react";

import { onModelsReleased } from "../ipc/models";
import { useAgentStore } from "../state/agentStore";
import { useModelCatalogStore } from "../state/modelCatalogStore";
import { useProjectStore } from "../state/projectStore";
import { useProviderAccountStore } from "../state/providerAccountStore";
import { adoptRememberedMode } from "../state/agentModeStore.ts";
import { useSettingsStore } from "../state/settingsStore";
import { useTerminalStore } from "../state/terminalStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { restoredProjectId } from "./sessionRestore";
import { startAppRuntime } from "./appStartup";
import {
  notifyModelsReleased,
  notifyResumeRestarted,
  notifySessionExit,
} from "./notificationTriggers";
import { providerAccountRuntimeUpdate } from "./providerAccountPolicy";
import { claimFailedResume } from "./resumeRecovery";
import { notePromptInput } from "./terminalChatTitleSource";
import {
  setSessionExitHandler,
  setSessionInputHandler,
  setSessionTitleHandler,
} from "./terminalEvents";

async function refreshConnectedAccounts(): Promise<void> {
  await useProviderAccountStore.getState().refresh();
  const { providers, error, loaded } = useProviderAccountStore.getState();
  const current = useSettingsStore.getState().settings?.enabledAgentIds;
  if (!current) return;
  const enabledAgentIds = providerAccountRuntimeUpdate(current, providers, loaded, error);
  if (enabledAgentIds) await useSettingsStore.getState().update({ enabledAgentIds });
}

/** Session-scoped IPC handlers plus the concurrent startup fan-out. */
function useAppStartup(): void {
  useEffect(() => {
    setSessionExitHandler((id, code) => {
      const terminals = useTerminalStore.getState();
      terminals.markExited(id, code);
      const pane = terminals.panes.find((candidate) => candidate.id === id);
      // An agent that refused to continue a conversation gets one clean
      // restart instead of leaving the user a dead pane. See `resumeRecovery`
      // for why this is a recovery rather than another preflight.
      if (pane && claimFailedResume(pane.persistenceId, code)) {
        notifyResumeRestarted(pane);
        void terminals.recoverResume(id);
        return;
      }
      notifySessionExit(id, code);
    });
    setSessionTitleHandler((id, title) => {
      useTerminalStore.getState().setOsc(id, title);
    });
    setSessionInputHandler(notePromptInput);
    startAppRuntime(
      {
        initializeWorkspace: async () => {
          await useSettingsStore.getState().load();
          // Straight after settings, before the workspace paints: the window
          // should open in whichever of the three modes it was left in, not
          // flash Code Mode on the way to Agent Mode.
          adoptRememberedMode();
          void refreshConnectedAccounts();
          await useWorkspaceStore.getState().init();
          await useProjectStore.getState().init();
          await useTerminalStore.getState().restoreSession();
          // Put the user back in front of the terminals they left, rather
          // than on the Home screen that only tallies them. `activate` rather
          // than a view flip, because the restored panes may belong to a
          // project other than the last one opened — the file tree, the
          // preview and the pane visibility all have to follow them.
          const project = useProjectStore.getState();
          const restored = restoredProjectId(useTerminalStore.getState().panes, project.activeId);
          if (restored) await project.activate(restored);
        },
        refreshAgents: () => useAgentStore.getState().refresh(),
        refreshModels: () => useModelCatalogStore.getState().refresh(),
      },
      (scope) => {
        if (scope === "workspace") {
          useWorkspaceStore.getState().setError("Vibyra could not finish loading this workspace.");
        }
      },
    );
  }, []);
}

/** Rust watches OpenRouter in the background; when a model drops, refresh the
 * picker catalog past its cache and tell the user. */
function useModelReleaseWatch(): void {
  useEffect(() => {
    const unlisten = onModelsReleased((models) => {
      void useModelCatalogStore.getState().refresh(true);
      notifyModelsReleased(models);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);
}

/** Warms the screenshot editor chunk once the app is quiet. The shortcut is
 * global, so its first press must not wait on a module fetch. */
function useScreenshotEditorPrefetch(): void {
  useEffect(() => {
    const timer = setTimeout(() => void import("../components/layout/ScreenshotEditor"), 1_500);
    return () => clearTimeout(timer);
  }, []);
}

/** Everything the authenticated workspace starts once, kept out of the shell
 * component so it stays a layout file. */
export function useWorkspaceRuntime(): void {
  useAppStartup();
  useModelReleaseWatch();
  useScreenshotEditorPrefetch();
}
