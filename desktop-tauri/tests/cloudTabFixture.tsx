import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { SettingsModal } from "../src/components/settings/SettingsModal";
import { useSettingsStore } from "../src/state/settingsStore";
import { useWorkspaceStore } from "../src/state/workspaceStore";
import { useAccountStore } from "../src/state/accountStore";
import { usePhoneStore } from "../src/state/phoneStore";
import { runVibyraTool } from "../src/lib/vibyraToolRunner";
import { parityData } from "./cloudParityData";
import type { PhoneStatus } from "../src/ipc/phone";

mockWindows("main");
const query = new URLSearchParams(location.search);
const mode = query.get("mode") ?? "connected";
document.documentElement.dataset.platform = "mac";
document.documentElement.dataset.theme = query.has("light") ? "light" : "dark";
const data = parityData(query), settings = data.settings;
let status = data.status;
if (query.has("changes") && status.projects.length) status.projects[0].pendingChange = { seq: 7, files: [
  { path: "src/main.ts", status: "modified", mode: "text" }, { path: "src/conflict.ts", status: "modified", mode: "text" },
] };
let machineState = "running", cloudError = false, finishConnect: (() => void) | null = null, failWake = query.has("wakeFail");
const phases = new Map(status.projects.map(p => [p.projectKey!, p.state === "synced" ? "ready" : "uploading"]));
const loginStates = new Map<string, string>([["claude", "ready"], ["codex", "ready"]]);
const logins = () => ["codex", "claude"].map(id => ({ id, state: loginStates.get(id), error: null }));
const enabled = { claude: true, codex: true, github: true };
const calls: { command: string; payload: Record<string, unknown> }[] = [];
const overview = () => ({
  computer: { ok: true, enabled: true, connected: status.accountConnected, consentVersion: 3,
    computer: status.accountConnected ? { state: machineState, online: machineState === "running", error: null, sessionsActive: 0,
      login: { claude: true, codex: false }, projects: [] } : null },
  access: { ok: true, autoWake: true, projects: status.projects.map(p => ({ projectKey: p.projectKey, name: p.name,
    allowed: p.state !== "notChosen", cloud: { state: "pending", syncedAt: null,
      status: { phase: phases.get(p.projectKey!) ?? "waiting_mac", sent: 4200, total: 10000 } } })),
    providers: { claude: { enabled: enabled.claude }, codex: { enabled: enabled.codex, cloudLogin: { pending: false, appliedAt: null } } },
    integrations: { github: { enabled: enabled.github } },
    capacity: { storage: { usedBytes: 1200000000, limitBytes: 5000000000 }, hours: { allowanceSeconds: 144000, usedSeconds: 3600, overage: "tokens", resetsAt: null }, idleStopSeconds: 300 },
    macs: [{ id: "fixture-mac", state: status.paused ? "paused" : "online", lastSeenAt: new Date().toISOString() }] },
});
let phone: PhoneStatus = { enabled: true, typing: true, discoverable: true, address: "", error: null,
  devices: [{ id: "phone", name: "iPhone" }], active: mode === "offline" ? [] : ["phone"], pending: [], remote: { enabled: true, signedIn: true } };
mockIPC(async (command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>; calls.push({ command, payload: args });
  if (command === "get_settings") return settings;
  if (command === "phone_status") return phone;
  if (command === "cloud_sync_status") return structuredClone(status);
  if (command === "cloud_overview") { if (cloudError) throw new Error("Cloud updates could not be loaded"); return overview(); }
  if (command === "cloud_sync_connect_mac") {
    if (query.has("consentFail")) throw new Error("consent_outdated");
    status = { ...status, accountConnected: true, projects: status.projects.map(p => ({ ...p,
      state: (args.projects as { id: string }[]).some(c => c.id === p.id) ? "pending" : "notChosen" })) };
    for (const p of status.projects) phases.set(p.projectKey!, "saved");
    Object.assign(enabled, args.accounts);
    if (query.has("delayConnect")) await new Promise<void>(resolve => { finishConnect = resolve; });
    return structuredClone(status);
  }
  if (command === "cloud_page_action") {
    if (args.action === "wake") { if (failWake) { failWake = false; throw new Error("Cloud could not start. Try again."); } machineState = "running"; }
    if (args.action === "stop") machineState = "stopped";
    if (args.action === "disconnect") status = { ...status, accountConnected: false };
    if (args.action === "provider") enabled[args.provider as keyof typeof enabled] = args.enabled as boolean;
    if (args.action === "repair") phases.set(args.projectKey as string, "uploading");
    return overview();
  }
  if (command === "cloud_sync_set_project") {
    status = { ...status, projects: status.projects.map(p => p.id === args.projectId ? { ...p, state: args.enabled ? "pending" : "notChosen" } : p) };
    return structuredClone(status);
  }
  if (command === "cloud_sync_set_paused") { status = { ...status, paused: args.paused as boolean }; return status; }
  if (command === "cloud_sync_set_options") { status = { ...status, ...(args.options as object) }; return status; }
  if (command === "cloud_logins_status") return logins();
  if (command === "cloud_logins_allow") { loginStates.set(args.provider as string, "allowing"); return logins(); }
  if (command === "cloud_logins_stop") { for (const id of loginStates.keys()) loginStates.set(id, "ready"); return logins(); }
  if (command === "cloud_sync_change_review") return { seq: 7, digest: "review-digest", changes: ["src/main.ts"], conflicts: ["src/conflict.ts"], unapplied: [] };
  if (command === "cloud_sync_change_file") return { path: args.path, base: { text: "Before" }, local: { text: "This computer's changes" }, cloud: { text: "Cloud's changes" } };
  if (command === "cloud_sync_change_apply") {
    status.projects = status.projects.map(p => p.id === args.projectId ? { ...p, pendingChange: null } : p);
    return { applied: ["src/main.ts"], conflicts: ["src/conflict.ts"], backup: "/sample/.vibyra-backups/review", unapplied: [] };
  }
  if (command === "provider_accounts") return query.has("noaccounts") ? [] : ["codex", "claude"].map(id => ({ id, company: id, product: id, runtimeId: id, installed: true, package: "", canAddAccount: true,
    accounts: [{ accountId: "default", status: "connected", accountLabel: "Sample", detail: "", signInPageAvailable: false, prompt: "", removable: false }] }));
  if (command === "teammate_request" && args.path === "connectors") return { enabled: true, integrations: query.has("noaccounts") ? [] : [{ id: "github", installed: true }] };
  if (command === "shell_autostart_get") return false;
  if (command === "plugin:notification|is_permission_granted") return true;
  return null;
});
useSettingsStore.setState({ settings });
useAccountStore.setState({ snapshot: { status: "signedIn", profile: { welcomeKey: "cloud-tab", name: "Sample", email: "sample@example.test" }, secureStorage: true } } as never);
const publish = () => usePhoneStore.setState({ status: phone, accountScope: "cloud-tab" });
publish();
useWorkspaceStore.setState({ settingsOpen: true, settingsSection: "cloud", settingsPanel: null });
Object.assign(window, { cloudFixture: {
  calls, runTool: runVibyraTool, finishConnect: () => finishConnect?.(),
  connectPhone: () => { phone = { ...phone, active: ["phone"] }; publish(); },
  disconnectPhone: () => { phone = { ...phone, active: [] }; publish(); },
  secondPhone: () => { phone = { ...phone, devices: [...phone.devices, { id: "second", name: "Second phone" }], active: ["second"] }; publish(); },
  switchAccount: () => { phone = { ...phone, active: [], devices: [] }; useAccountStore.setState({ snapshot: { status: "signedIn", profile: { welcomeKey: "other", email: "other@example.test" } } } as never); },
  unavailable: () => { cloudError = true; },
  recover: () => { cloudError = false; },
  phase: (id: string, phase: string) => { const p = status.projects.find(p => p.id === id); if (p?.projectKey) phases.set(p.projectKey, phase); },
  land: (count: number) => status.projects.filter(p => p.state !== "notChosen").forEach((p, i) => { phases.set(p.projectKey!, i < count ? "ready" : "applying"); }),
} });
createRoot(document.getElementById("root")!).render(<div className="app"><SettingsModal /></div>);
