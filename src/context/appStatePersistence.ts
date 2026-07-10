import { Project } from "../types/domain";
import { PersistedSession } from "../utils/persistence";
import { limitDetachedChatRecords, normalizeChatThreads, normalizeChatTitles } from "../utils/chatThreads";
import { normalizeProjectMemories } from "../utils/projectMemory";
import { AppState } from "./appContextTypes";

export const emptyPromptMoney: AppState["promptMoney"] = {
  total: 0,
  count: 0,
  lastEarned: 0,
  longestPromptLength: 0
};

export function getPersistedAppState(session: PersistedSession) {
  const appState = session.user?.appState ?? {};
  return normalizeAppStateSnapshot(appState);
}

export function normalizeAppStateSnapshot(appState: Record<string, unknown>) {
  const detachedChatThreads = normalizeChatThreads(appState.detachedChatThreads);
  const detachedChatTitles = normalizeChatTitles(appState.detachedChatTitles);
  const detachedChatUpdatedAt = normalizeDetachedChatUpdatedAt(appState.detachedChatUpdatedAt);
  const detachedChats = limitDetachedChatRecords(detachedChatThreads, detachedChatTitles, detachedChatUpdatedAt);

  return {
    chatThreads: normalizeChatThreads(appState.chatThreads),
    chatTitles: normalizeChatTitles(appState.chatTitles),
    detachedChatThreads: detachedChats.threads,
    detachedChatTitles: detachedChats.titles,
    detachedChatUpdatedAt: detachedChats.updatedAt,
    chatProjects: normalizeChatProjects(appState.chatProjects),
    projectMemories: normalizeProjectMemories(appState.projectMemories),
    editApprovals: normalizeEditApprovals(appState.editApprovals),
    desktopPermissionMode: normalizeDesktopPermissionMode(appState.desktopPermissionMode),
    selectedModel: normalizeSelectedModel(appState.selectedModel),
    profileImageUri: normalizeProfileImageUri(appState.profileImageUri),
    selectedChatModel: normalizeString(appState.selectedChatModel),
    promptMoney: normalizePromptMoney(appState.promptMoney)
  };
}

export function createPersistableAppState(appState: {
  chatThreads: Record<string, unknown>;
  chatTitles: Record<string, unknown>;
  detachedChatThreads: Record<string, unknown>;
  detachedChatTitles: Record<string, unknown>;
  detachedChatUpdatedAt: Record<string, unknown>;
  chatProjects: Record<string, Project>;
  projectMemories: unknown;
  editApprovals: unknown;
  profileImageUri?: unknown;
  selectedModel?: unknown;
  selectedChatModel?: unknown;
  desktopPermissionMode?: unknown;
  promptMoney?: unknown;
}) {
  return normalizeAppStateSnapshot(appState);
}

function normalizeSelectedModel(value: unknown): AppState["selectedModel"] {
  if (
    value === "gpt-5.6-sol" ||
    value === "gpt-5.6-terra" ||
    value === "gpt-5.6-luna" ||
    value === "gpt-5.5" ||
    value === "gpt-5.4" ||
    value === "gpt-5.4-mini" ||
    value === "gpt-5.4-nano" ||
    value === "gpt-5-codex"
  ) {
    return value;
  }
  return "gpt-5.6-sol";
}

function normalizePromptMoney(value: unknown): AppState["promptMoney"] {
  if (!value || typeof value !== "object") return emptyPromptMoney;
  const promptMoney = value as Partial<AppState["promptMoney"]>;
  return {
    total: normalizeNumber(promptMoney.total),
    count: normalizeNumber(promptMoney.count),
    lastEarned: normalizeNumber(promptMoney.lastEarned),
    longestPromptLength: normalizeNumber(promptMoney.longestPromptLength)
  };
}

function normalizeChatProjects(value: unknown): Record<string, Project> {
  return value && typeof value === "object" ? (value as Record<string, Project>) : {};
}

function normalizeDetachedChatUpdatedAt(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((updatedAt, [chatId, timestamp]) => {
    const normalized = normalizeNumber(timestamp);
    if (normalized > 0) updatedAt[chatId] = normalized;
    return updatedAt;
  }, {});
}

function normalizeEditApprovals(value: unknown): Record<string, "always"> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v === "always");
  return Object.fromEntries(entries) as Record<string, "always">;
}

function normalizeDesktopPermissionMode(_value: unknown): AppState["desktopPermissionMode"] {
  return "ask";
}

function normalizeProfileImageUri(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
