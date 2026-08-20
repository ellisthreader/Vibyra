import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { FirstWelcome } from "../auth/FirstWelcome";
import { Companion } from "../companion/Companion";
import { ProjectStrip } from "./ProjectStrip";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { Rail } from "./Rail";
import { ScreenshotTray } from "./ScreenshotTray";
import { TitleBar } from "./TitleBar";
import { Toasts } from "./Toasts";
import { VoiceHud } from "./VoiceHud";
import { CloseConfirmModal } from "./CloseConfirmModal";
import { startSessionPersistence } from "../../lib/sessionPersistence";
import { useCloseGuardStore } from "../../state/closeGuardStore";
import { activityFor } from "../../lib/activity";
import { startAppRuntime } from "../../lib/appStartup";
import { hasSeenFirstWelcome } from "../../lib/firstWelcomePolicy";
import { providerAccountRuntimeUpdate } from "../../lib/providerAccountPolicy";
import { onModelsReleased } from "../../ipc/models";
import { setSessionExitHandler, setSessionTitleHandler } from "../../lib/terminalRegistry";
import { useLaunchApprovalStore } from "../../state/launchApprovalStore";
import { useAccountStore } from "../../state/accountStore";
import { useModelCatalogStore } from "../../state/modelCatalogStore";
import { useGlobalShortcuts } from "../../lib/useGlobalShortcuts";
import { useAgentStore } from "../../state/agentStore";
import { useProjectStore } from "../../state/projectStore";
import { useProviderAccountStore } from "../../state/providerAccountStore";
import { useScreenshotStore } from "../../state/screenshotStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";
import { useWorkspaceStore } from "../../state/workspaceStore";

const AgentPickerModal = lazy(() => import("../agents/AgentPickerModal")
  .then((module) => ({ default: module.AgentPickerModal })));
const CommandPalette = lazy(() => import("./CommandPalette")
  .then((module) => ({ default: module.CommandPalette })));
const FilePreviewModal = lazy(() => import("../files/FilePreviewModal")
  .then((module) => ({ default: module.FilePreviewModal })));
const HomeView = lazy(() => import("../home/HomeView")
  .then((module) => ({ default: module.HomeView })));
const LaunchApprovalModal = lazy(() => import("../rail/LaunchApprovalModal")
  .then((module) => ({ default: module.LaunchApprovalModal })));
const ScreenshotEditor = lazy(() => import("./ScreenshotEditor")
  .then((module) => ({ default: module.ScreenshotEditor })));
const SettingsModal = lazy(() => import("../settings/SettingsModal")
  .then((module) => ({ default: module.SettingsModal })));

async function refreshConnectedAccounts() {
  await useProviderAccountStore.getState().refresh();
  const { accounts, error, loaded } = useProviderAccountStore.getState();
  const current = useSettingsStore.getState().settings?.enabledAgentIds;
  if (!current) return;
  const enabledAgentIds = providerAccountRuntimeUpdate(current, accounts, loaded, error);
  if (enabledAgentIds) await useSettingsStore.getState().update({ enabledAgentIds });
}

/** The authenticated workspace. Mounted only after the account gate passes,
 * so projects, agents, models, and workspace state initialise post sign-in. */
export function WorkspaceApp() {
  const profile = useAccountStore((s) => s.snapshot.profile);
  const settings = useSettingsStore((s) => s.settings);
  const view = useProjectStore((s) => s.view);
  const activeId = useProjectStore((s) => s.activeId);
  const projectMode = useWorkspaceStore((s) => s.projectMode);
  const settingsOpen = useWorkspaceStore((s) => s.settingsOpen);
  const agentPickerOpen = useWorkspaceStore((s) => s.agentPickerOpen);
  const paletteOpen = useWorkspaceStore((s) => s.paletteOpen);
  const filePreviewOpen = useWorkspaceStore((s) => s.preview !== null);
  const launchApprovalOpen = useLaunchApprovalStore((s) => s.pending !== null);
  const screenshotEditorOpen = useScreenshotStore((s) => s.draft !== null);
  const [welcomeOpen, setWelcomeOpen] = useState(() => !hasSeenFirstWelcome(profile));
  const [welcomeHandoff, setWelcomeHandoff] = useState(false);
  useGlobalShortcuts();

  const beginWelcomeHandoff = useCallback(() => setWelcomeHandoff(true), []);
  const finishWelcome = useCallback((handoff: boolean) => {
    setWelcomeOpen(false);
    if (!handoff) return;
    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>("[data-welcome-focus]");
      target?.focus({ preventScroll: true });
      target?.classList.add("first-welcome-focus");
      window.setTimeout(() => target?.classList.remove("first-welcome-focus"), 1_300);
      window.setTimeout(() => setWelcomeHandoff(false), 700);
    });
  }, []);

  useEffect(() => {
    setSessionExitHandler((id, code) => {
      useTerminalStore.getState().markExited(id, code);
    });
    setSessionTitleHandler((id, title) => {
      useTerminalStore.getState().setOsc(id, title);
    });
    startAppRuntime(
      {
        initializeWorkspace: async () => {
          await useSettingsStore.getState().load();
          void refreshConnectedAccounts();
          await useWorkspaceStore.getState().init();
          await useProjectStore.getState().init();
          await useTerminalStore.getState().restoreSession();
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

  // Rust vetoes the first close and hands the decision here, so a window with
  // live terminals can warn before killing them and flush the session first.
  useEffect(() => {
    const stopPersisting = startSessionPersistence();
    const unlisten = listen("vibyra://close-requested", () => {
      void useCloseGuardStore.getState().request();
    });
    return () => {
      stopPersisting();
      void unlisten.then((off) => off());
    };
  }, []);

  // Rust watches OpenRouter in the background; when a model drops, refresh
  // the picker catalog past its cache and surface a toast.
  useEffect(() => {
    const unlisten = onModelsReleased((models) => {
      void useModelCatalogStore.getState().refresh(true);
      const names = models.slice(0, 3).map((m) => m.name).join(", ");
      useWorkspaceStore
        .getState()
        .setError(
          models.length === 1
            ? `New model released: ${names}`
            : `${models.length} new models released: ${names}…`,
        );
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Warm the screenshot editor chunk once the app is quiet. The shortcut is
  // global, so its first press must not wait on a module fetch before the
  // capture can be shown.
  useEffect(() => {
    const timer = setTimeout(() => void import("./ScreenshotEditor"), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Derive coarse activity (working / idle / attention) on a slow tick so
  // the high-rate output flushes never touch React state.
  useEffect(() => {
    const timer = setInterval(() => {
      const { panes, applyActivity } = useTerminalStore.getState();
      const next: Record<number, ReturnType<typeof activityFor>> = {};
      for (const pane of panes) {
        if (pane.status !== "running" || pane.visibility === "hibernated") continue;
        next[pane.id] = activityFor(pane.id);
      }
      applyActivity(next);
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  if (!settings) {
    return <div className="boot">Starting Vibyra…</div>;
  }

  const showProject = view === "project" && activeId !== null;

  return (
    <div className={`app ${welcomeHandoff ? "app--welcome-handoff" : ""}`}>
      <TitleBar />
      <div className="shell">
        <ProjectStrip />
        {showProject ? (
          <>
            {projectMode === "terminals" && <Rail />}
            <ProjectWorkspace />
            {projectMode === "terminals" && <Companion />}
          </>
        ) : (
          <Suspense fallback={null}><HomeView /></Suspense>
        )}
      </div>
      <Toasts />
      <VoiceHud />
      <CloseConfirmModal />
      <ScreenshotTray />
      <Suspense fallback={null}>
        {screenshotEditorOpen ? <ScreenshotEditor /> : null}
        {paletteOpen ? <CommandPalette /> : null}
        {agentPickerOpen ? <AgentPickerModal /> : null}
        {launchApprovalOpen ? <LaunchApprovalModal /> : null}
        {settingsOpen ? <SettingsModal /> : null}
        {filePreviewOpen ? <FilePreviewModal /> : null}
      </Suspense>
      {welcomeOpen && profile ? (
        <FirstWelcome
          profile={profile}
          onFinish={finishWelcome}
          onHandoffStart={beginWelcomeHandoff}
        />
      ) : null}
    </div>
  );
}
