import { DEFAULT_NOTIFICATIONS } from "../src/lib/notificationPrefs";
import type { Settings } from "../src/types";
import type { SyncStatus } from "../src/lib/cloudSyncClient";

const projectNames = ["Vibyra", "HKE", "Bear-Lane", "PortfolioWebsite", "Vibyra-web"];
export function parityData(query: URLSearchParams) {
  const names = query.has("empty") ? [] : query.has("long") ? Array.from({ length: 35 }, (_, i) => `Project ${i + 1} with a much longer name to verify reading and scrolling`) : projectNames;
  const mode = query.get("mode") ?? "connected";
  const projects = names.map((name, i) => ({ id: `p${i}`, projectKey: String(i).padStart(32, "a"), name, enabled: true,
    state: mode === "notConnected" && !query.has("existing") || i === 2 ? "notChosen" : i === 1 ? "syncing" : "synced", syncedAt: 1791392000,
    heldBackCount: 0, heldBack: [], lastError: null, skippedReason: null, retryAt: null, pendingChange: null }));
  const settings = { theme: query.has("light") ? "light" : "dark", agentView: "terminal", fontSize: 13, fontFamily: "JetBrains Mono", scrollbackLines: 5000,
    rendererMode: "auto", performanceMode: "balanced", persistTerminalScrollback: true, sendProjectContext: true, enabledAgentIds: [],
    projects: projects.map(p => ({ id: p.id, name: p.name, path: `/sample/${p.id}` })), activeProjectId: names.length ? "p1" : null, customAgents: [],
    notifications: DEFAULT_NOTIFICATIONS, voiceShortcut: "F8", screenshotShortcut: "F9", talkShortcut: "F10", speechVoice: "nova", speechRate: 1,
    speechStyle: "", voiceLanguage: "", talkPauseMs: 1100 } as unknown as Settings;
  const status = { enabled: true, consentVersion: 1, requiredConsentVersion: 1, needsConsent: mode === "notConnected", includeConversations: true, includeEnv: false,
    autoApplySafe: false, gate: "ready", message: null, lastSyncedAt: null, heldBackTotal: 0, pendingFilesTotal: 0,
    codexLogin: { on: false, state: "off", sentAt: null, error: null }, projects, paused: mode === "paused", accountConnected: mode !== "notConnected" } as SyncStatus;
  return { settings, status };
}
