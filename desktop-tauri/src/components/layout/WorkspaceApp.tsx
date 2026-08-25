import { lazy, Suspense, useCallback, useState } from "react";

import { FirstWelcome } from "../auth/FirstWelcome";
import { Companion } from "../companion/Companion";
import { CloseConfirmModal } from "./CloseConfirmModal";
import { ProjectStrip } from "./ProjectStrip";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { Rail } from "./Rail";
import { ScreenshotTray } from "./ScreenshotTray";
import { TitleBar } from "./TitleBar";
import { VoiceHud } from "./VoiceHud";
import { PinnedNotice } from "../notifications/PinnedNotice";
import { Toasts } from "../notifications/Toasts";
import { hasSeenFirstWelcome } from "../../lib/firstWelcomePolicy";
import { terminalsVisible } from "../../lib/stageLayout";
import { useActivityTicker } from "../../lib/useActivityTicker";
import { useGlobalShortcuts } from "../../lib/useGlobalShortcuts";
import { useSessionLifecycle } from "../../lib/useSessionLifecycle";
import { useUpdateWatch } from "../../lib/useUpdateWatch";
import { useNotificationRuntime } from "../../lib/useNotificationRuntime";
import { useWorkspaceRuntime } from "../../lib/useWorkspaceRuntime";
import { useAccountStore } from "../../state/accountStore";
import { useLaunchApprovalStore } from "../../state/launchApprovalStore";
import { useProjectStore } from "../../state/projectStore";
import { useReportStore } from "../../state/reportStore";
import { useScreenshotStore } from "../../state/screenshotStore";
import { useSettingsStore } from "../../state/settingsStore";
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
const ReportModal = lazy(() => import("../report/ReportModal")
  .then((module) => ({ default: module.ReportModal })));
const ScreenshotEditor = lazy(() => import("./ScreenshotEditor")
  .then((module) => ({ default: module.ScreenshotEditor })));
const SettingsModal = lazy(() => import("../settings/SettingsModal")
  .then((module) => ({ default: module.SettingsModal })));

/** The authenticated workspace. Mounted only after the account gate passes,
 * so projects, agents, models, and workspace state initialise post sign-in. */
export function WorkspaceApp() {
  const profile = useAccountStore((s) => s.snapshot.profile);
  const settings = useSettingsStore((s) => s.settings);
  const view = useProjectStore((s) => s.view);
  const activeId = useProjectStore((s) => s.activeId);
  const stageLayout = useWorkspaceStore((s) => s.stageLayout);
  const settingsOpen = useWorkspaceStore((s) => s.settingsOpen);
  const agentPickerOpen = useWorkspaceStore((s) => s.agentPickerOpen);
  const paletteOpen = useWorkspaceStore((s) => s.paletteOpen);
  const filePreviewOpen = useWorkspaceStore((s) => s.preview !== null);
  const launchApprovalOpen = useLaunchApprovalStore((s) => s.pending !== null);
  const screenshotEditorOpen = useScreenshotStore((s) => s.draft !== null);
  const reportOpen = useReportStore((s) => s.open);
  const [welcomeOpen, setWelcomeOpen] = useState(() => !hasSeenFirstWelcome(profile));
  const [welcomeHandoff, setWelcomeHandoff] = useState(false);

  useGlobalShortcuts();
  useWorkspaceRuntime();
  useNotificationRuntime();
  useSessionLifecycle();
  useActivityTicker();
  useUpdateWatch();

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
            {/* The rail stays up in every layout — it is the terminal list, and
                the way back from a full-stage preview. Only the side panel is
                terminal-specific. Choosing Preview used to unmount both. */}
            <Rail />
            <ProjectWorkspace />
            {terminalsVisible(stageLayout) && <Companion />}
          </>
        ) : (
          <Suspense fallback={null}><HomeView /></Suspense>
        )}
      </div>
      <PinnedNotice />
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
        {reportOpen ? <ReportModal /> : null}
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
