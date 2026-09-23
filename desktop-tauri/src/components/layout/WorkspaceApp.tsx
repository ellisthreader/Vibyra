import { NewProjectPage } from '../home/NewProjectPage';
import { useProductMode } from '../../state/productModeStore';
import { TeammatesWorkspace } from '../teammates/TeammatesWorkspace';
import { lazy, Suspense, useCallback, useState } from "react";

import { FirstWelcome } from "../auth/FirstWelcome";
import { CloseConfirmModal } from "./CloseConfirmModal";
import { ProjectStrip } from "./ProjectStrip";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { ScreenshotTray } from "./ScreenshotTray";
import { TitleBar } from "./TitleBar";
import { UpdateBanner } from "./UpdateBanner";
import { WhatsNew } from "./WhatsNew";
import { VoiceHud } from "./VoiceHud";
import { PhoneApprovalModal } from "../phone/PhoneApprovalModal";
import { Toasts } from "../notifications/Toasts";
import { hasSeenFirstWelcome } from "../../lib/firstWelcomePolicy";
import { useActivityTicker } from "../../lib/useActivityTicker";
import { useBackgroundThrottle } from "../../lib/useBackgroundThrottle";
import { useGlobalShortcuts } from "../../lib/useGlobalShortcuts";
import { useSessionLifecycle } from "../../lib/useSessionLifecycle";
import { useSpendWatch } from "../../lib/useSpendWatch";
import { useUpdateWatch } from "../../lib/useUpdateWatch";
import { useNotificationRuntime } from "../../lib/useNotificationRuntime";
import { usePhoneWatch } from "../../lib/usePhoneWatch";
import { useWorkspaceRuntime } from "../../lib/useWorkspaceRuntime";
import { useAccountStore } from "../../state/accountStore";
import { useLaunchApprovalStore } from "../../state/launchApprovalStore";
import { useProjectStore } from "../../state/projectStore";
import { useReportStore } from "../../state/reportStore";
import { useRunConfirmStore } from "../../state/runConfirmStore";
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
const RunConfirmModal = lazy(() => import("../companion/RunConfirmModal")
  .then((module) => ({ default: module.RunConfirmModal })));
const ReportModal = lazy(() => import("../report/ReportModal")
  .then((module) => ({ default: module.ReportModal })));
const SavedHistory = lazy(() => import("./SavedHistory")
  .then((module) => ({ default: module.SavedHistory })));
const ScreenshotEditor = lazy(() => import("./ScreenshotEditor")
  .then((module) => ({ default: module.ScreenshotEditor })));
const SettingsModal = lazy(() => import("../settings/SettingsModal")
  .then((module) => ({ default: module.SettingsModal })));

/** The authenticated workspace. Mounted only after the account gate passes,
 * so projects, agents, models, and workspace state initialise post sign-in. */
export function WorkspaceApp() {
  const productMode = useProductMode(s => s.mode);
  const profile = useAccountStore((s) => s.snapshot.profile);
  const settings = useSettingsStore((s) => s.settings);
  const view = useProjectStore((s) => s.view);
  const activeId = useProjectStore((s) => s.activeId);
  const settingsOpen = useWorkspaceStore((s) => s.settingsOpen);
  const agentPickerOpen = useWorkspaceStore((s) => s.agentPickerOpen);
  const paletteOpen = useWorkspaceStore((s) => s.paletteOpen);
  const historyOpen = useWorkspaceStore((s) => s.historyOpen);
  const filePreviewOpen = useWorkspaceStore((s) => s.preview !== null);
  const launchApprovalOpen = useLaunchApprovalStore((s) => s.pending !== null);
  const runConfirmOpen = useRunConfirmStore((s) => s.pending !== null);
  const screenshotEditorOpen = useScreenshotStore((s) => s.draft !== null);
  const reportOpen = useReportStore((s) => s.open);
  const [welcomeOpen, setWelcomeOpen] = useState(() => !hasSeenFirstWelcome(profile));
  const [welcomeHandoff, setWelcomeHandoff] = useState(false);

  useGlobalShortcuts();
  useWorkspaceRuntime();
  useNotificationRuntime();
  useSessionLifecycle();
  useActivityTicker();
  useBackgroundThrottle();
  useUpdateWatch();
  usePhoneWatch();
  useSpendWatch();

  const beginWelcomeHandoff = useCallback(() => {
    useProductMode.getState().choose("work");
    useProjectStore.getState().goHome();
    setWelcomeHandoff(true);
  }, []);
  const replayWelcome = useCallback(() => {
    setWelcomeHandoff(false);
    setWelcomeOpen(true);
  }, []);
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

  const showProject = view !== "home" && activeId !== null;

  return (
    <div className={`app ${welcomeHandoff ? "app--welcome-handoff" : ""}`}>
      <TitleBar onReplayWelcome={replayWelcome} />
      <div className="shell">
        <div className="product-code-shell" hidden={productMode !== "work"}>
        <ProjectStrip />
        {view === "new-project" && <NewProjectPage />}
        <div style={{ display: view === "new-project" ? "none" : "contents" }}>
        {showProject ? (
          <>
            <ProjectWorkspace active={productMode === "work" && view !== "new-project"} />
          </>
        ) : (
          <Suspense fallback={null}><HomeView /></Suspense>
        )}
        </div>
        </div>
        <TeammatesWorkspace active={productMode === "agent"} />
      </div>
      <UpdateBanner />
      <Toasts />
      <WhatsNew />
      <VoiceHud />
      <CloseConfirmModal />
      <PhoneApprovalModal />
      <ScreenshotTray />
      <Suspense fallback={null}>
        {screenshotEditorOpen ? <ScreenshotEditor /> : null}
        {paletteOpen ? <CommandPalette /> : null}
        {historyOpen ? <SavedHistory /> : null}
        {agentPickerOpen ? <AgentPickerModal /> : null}
        {launchApprovalOpen ? <LaunchApprovalModal /> : null}
        {runConfirmOpen ? <RunConfirmModal /> : null}
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
