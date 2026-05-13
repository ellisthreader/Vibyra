import { Project } from "../types/domain";
import { PersistedSession } from "../utils/persistence";
import { normalizeChatThreads, normalizeChatTitles } from "../utils/chatThreads";
import { AppState } from "./appContextTypes";

export const emptyPromptMoney: AppState["promptMoney"] = {
  total: 0,
  count: 0,
  lastEarned: 0,
  longestPromptLength: 0
};

export function getPersistedAppState(session: PersistedSession) {
  const appState = session.user?.appState ?? {};
  return {
    chatThreads: normalizeChatThreads(appState.chatThreads),
    chatTitles: normalizeChatTitles(appState.chatTitles),
    chatProjects: normalizeChatProjects(appState.chatProjects),
    editApprovals: normalizeEditApprovals(appState.editApprovals),
    selectedModel: normalizeSelectedModel(appState.selectedModel),
    profileImageUri: normalizeProfileImageUri(appState.profileImageUri),
    promptMoney: normalizePromptMoney(appState.promptMoney)
  };
}

function normalizeSelectedModel(value: unknown): AppState["selectedModel"] {
  if (
    value === "gpt-5.5" ||
    value === "gpt-5.4" ||
    value === "gpt-5.4-mini" ||
    value === "gpt-5.4-nano" ||
    value === "gpt-5-codex"
  ) {
    return value;
  }
  return "gpt-5.5";
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

function normalizeEditApprovals(value: unknown): Record<string, "always"> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v === "always");
  return Object.fromEntries(entries) as Record<string, "always">;
}

function normalizeProfileImageUri(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
