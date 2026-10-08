// One pop-up at a time on sample data, for `scripts/verify-dialogs.mjs`.
// `?d=<name>` picks the dialog and `&light` the light theme.
import { mockIPC } from "@tauri-apps/api/mocks";
import { createRoot } from "react-dom/client";

import { PhoneApprovalModal } from "../src/components/phone/PhoneApprovalModal";
import { RemoteSecurityMonitor } from "../src/components/phone/RemoteSecurityMonitor";
import { RunConfirmModal } from "../src/components/companion/RunConfirmModal";
import { LaunchApprovalModal } from "../src/components/rail/LaunchApprovalModal";
import { CloseConfirmModal } from "../src/components/layout/CloseConfirmModal";
import { PlanUpgradeModal } from "../src/components/plan/PlanUpgradeModal";
import { ReportModal } from "../src/components/report/ReportModal";
import { SettingsPhonePane } from "../src/components/settings/SettingsPhonePane";
import { useReportStore } from "../src/state/reportStore";
import { emptyDraft } from "../src/lib/reportDraft";
import { Toasts } from "../src/components/notifications/Toasts";
import { useNotificationStore } from "../src/state/notificationStore";
import { AgentPickerModal } from "../src/components/agents/AgentPickerModal";
import { SettingsModal } from "../src/components/settings/SettingsModal";
import { useWorkspaceStore } from "../src/state/workspaceStore";
import { useAgentStore } from "../src/state/agentStore";
import { useModelCatalogStore } from "../src/state/modelCatalogStore";
import { useSettingsStore } from "../src/state/settingsStore";
import { usePhoneStore } from "../src/state/phoneStore";
import { useRemoteSecurity } from "../src/state/remoteSecurityStore";
import { useAccountStore } from "../src/state/accountStore";
import { useRunConfirmStore } from "../src/state/runConfirmStore";
import { useLaunchApprovalStore } from "../src/state/launchApprovalStore";
import { useCloseGuardStore } from "../src/state/closeGuardStore";
import { usePlanPromptStore } from "../src/state/planPromptStore";

const query = new URLSearchParams(location.search);
const which = query.get("d") ?? "phone";
document.documentElement.dataset.theme = query.has("light") ? "light" : "dark";

const calls: [string, unknown][] = [];
const device = {
  id: "device-1", hostId: "host-a", publicKey: "key-a", pairingCode: "472831", deviceName: "Ellis’s iPhone",
  permissions: ["screen:view", "keyboard:control"], lastIp: "192.168.1.24", approvedAt: null, revokedAt: null,
};
const security = {
  scope: { accountScope: "account-a", hostId: "host-a" }, security: { mode: "ask", enabled: true },
  pendingDevices: which === "remote-pair" ? [device] : [],
  pendingSessions: which === "remote-session"
    ? [{ id: "s1", publicKey: "key-a", clientName: "Ellis’s iPhone", permissions: ["screen:view", "keyboard:control"], requestedAt: new Date().toISOString() }]
    : [],
  devices: [device], sessions: [], events: [],
};
mockIPC((command, args) => {
  calls.push([command, args]);
  if (command === "remote_security_snapshot") return structuredClone(security);
  return null;
});
(window as unknown as { gallery: unknown }).gallery = { calls };

const phone = (typing: boolean, preview = false) => usePhoneStore.setState({
  status: {
    enabled: true, typing, previewAutoAvailable: preview, discoverable: true, address: "192.168.1.10",
    error: null, devices: [], active: [],
    pending: [{ id: "8f3a91c2d7e04b6aa1c9f0e2b7d45a10", name: "Ellis’s iPhone 15 Pro" }],
  },
  refresh: async () => {},
} as never);

const noop = () => {};
switch (which) {
  case "phone": phone(false); break;
  case "phone-typing": phone(true, true); break;
  case "remote-pair":
  case "remote-session":
    usePhoneStore.setState({ status: { enabled: true, discoverable: true, address: "", error: null, devices: [], active: [], pending: [] } } as never);
    useAccountStore.setState((state) => ({ snapshot: { ...state.snapshot, profile: { welcomeKey: "account-a" } } }) as never);
    break;
  case "run":
    useRunConfirmStore.setState({ pending: {
      lines: ["rm -rf node_modules dist", "git push --force origin main"],
      reasons: ["Deletes files without moving them to the Trash.", "Rewrites history on a shared branch."],
      destination: "In Studio · ~/Projects/Studio · Terminal 2", confirm: noop, cancel: noop,
    } });
    break;
  case "launch":
    useLaunchApprovalStore.setState({ pending: { projectName: "Studio", changedFiles: 14, workerCount: 3, continueLaunch: async () => {} } });
    break;
  case "close":
    useCloseGuardStore.setState({ prompting: ["Claude · Fix the login redirect", "Codex · Add dark mode toggle", "npm run dev"] });
    break;
  case "report":
    useReportStore.setState({ open: true, capturing: false, status: "idle", channelReady: true,
      draft: { ...emptyDraft("Terminals"), summary: "" },
      surroundings: { context: { reporter: "Ellis", platform: "macOS 26.6 · Apple M3", hardware: null, ip: null, locale: "en-GB", screen: null } as never, sessionId: 2, area: "Terminals", paneName: "Claude · Fix the login redirect" },
    } as never);
    break;
  case "settings-iphone":
    usePhoneStore.setState({
      status: { enabled: true, typing: true, notifications: true, previewAutoAvailable: true, discoverable: true, listening: true, address: "192.168.1.10", error: null,
        devices: [{ id: "key-a", name: "Ellis’s iPhone 15 Pro", lastSeen: new Date().toISOString(), lastFrom: "192.168.1.24", lastRoute: "nearby" }],
        active: ["key-a"], pending: [], remote: { enabled: true, signedIn: true, leg: { state: "online", clients: 0 } } },
      refresh: async () => {},
    } as never);
    break;
  case "remote-active":
    usePhoneStore.setState({ status: { enabled: true, discoverable: true, address: "", error: null, pending: [],
      devices: [{ id: "key-a", name: "Ellis’s iPhone 15 Pro", lastRoute: "cloud" }], active: ["key-a"] }, refresh: async () => {} } as never);
    useNotificationStore.setState({ visible: [
      { id: 1, at: Date.now(), count: 1, category: "agentDone", severity: "success", title: "Claude finished", body: "Fix the login redirect · Studio" },
    ] } as never);
    break;
  case "toasts": {
    const at = Date.now();
    useNotificationStore.setState({ visible: [
      { id: 1, at, count: 1, category: "agentDone", severity: "success", title: "Claude finished", body: "Fix the login redirect · Studio", action: { id: "focus-session", label: "Open", arg: 2 } },
      { id: 2, at, count: 3, category: "agentAttention", severity: "warning", title: "Codex needs your approval", body: "Wants to run npm install in Orbit" },
      { id: 3, at, count: 1, category: "agentFailed", severity: "danger", title: "Preview stopped", body: "Port 5173 is already in use." },
    ] } as never);
    break;
  }
  case "picker":
    useAgentStore.setState({ agents: [{ id: "shell", name: "Shell", program: "zsh", description: "Your login shell in this project", installed: true, accent: "#8a93a6" }], refresh: async () => {} } as never);
    useModelCatalogStore.setState({ groups: [], refresh: async () => {} } as never);
    useWorkspaceStore.setState({ agentPickerOpen: true } as never);
    break;
  case "settings":
    useSettingsStore.setState({
      settings: { theme: "dark", fontSize: 13, fontFamily: "JetBrains Mono", scrollbackLines: 5000, projects: [], customAgents: [], enabledAgentIds: [],
        workspaceRoot: null, screenshotDir: null, screenshotHideWindow: false, openaiKeyConfigured: true, talkShortcut: "F10", voiceShortcut: "F8", screenshotShortcut: "F9" },
      update: async () => {}, commit: () => {},
    } as never);
    useWorkspaceStore.setState({ settingsOpen: true, settingsSection: "general", settingsPanel: null } as never);
    break;
  case "plan":
    usePlanPromptStore.setState({ notice: { feature: "worktrees", message: "Safe mode worktrees are part of Vibyra Pro. Your current terminals keep running." } });
    break;
}

/** Something to sit behind the scrim, so the dialog is judged in context. */
function Workspace() {
  return (
    <div className="gallery-workspace" style={{ position: "fixed", inset: 0, display: "grid", gridTemplateColumns: "232px 1fr", background: "var(--canvas)" }}>
      <aside style={{ background: "var(--rail)", borderRight: "1px solid var(--border)", padding: 18, display: "grid", alignContent: "start", gap: 10 }}>
        {["Studio", "Orbit", "Marketing site", "Notes"].map((name) => (
          <div key={name} style={{ color: "var(--muted)", fontSize: 13, padding: "6px 8px" }}>{name}</div>
        ))}
      </aside>
      <main style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: 14 }}>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} style={{ background: "var(--term-screen, #0b0c0f)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
            {"> claude\n  Reading src/app/routes.tsx…\n  Editing 3 files".split("\n").map((line) => <div key={line}>{line}</div>)}
          </div>
        ))}
      </main>
    </div>
  );
}

function Gallery() {
  return (
    <>
      <Workspace />
      {which.startsWith("phone") && <PhoneApprovalModal />}
      {which.startsWith("remote") && <RemoteSecurityMonitor />}
      {which === "remote-active" && <Toasts />}
      {which === "run" && <RunConfirmModal />}
      {which === "launch" && <LaunchApprovalModal />}
      {which === "close" && <CloseConfirmModal />}
      {which === "plan" && <PlanUpgradeModal />}
      {which === "report" && <ReportModal />}
      {which === "toasts" && <Toasts />}
      {which === "picker" && <AgentPickerModal />}
      {which === "settings" && <SettingsModal />}
      {which === "settings-iphone" && <div className="modal-backdrop"><section className="modal settings-modal settings-modal--tiles" role="dialog"><div className="settings-pane"><header className="settings-pane__header"><h1 className="settings-pane__title">iPhone</h1></header><div className="settings-pane__body"><SettingsPhonePane /></div></div></section></div>}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Gallery />);
