import type { ChatRunStatus } from "../types/domain";

export const CHAT_TOOL_STAGE_MS = [0, 900, 1800, 2700] as const;
export const CHAT_TOOL_MIN_PROGRESS_MS = 3600;

export type ChatToolRunKey = Pick<ChatRunStatus, "mode" | "route" | "startedAt" | "tool">;

export function chatToolStageIndex(elapsedMs: number) {
  if (elapsedMs < CHAT_TOOL_STAGE_MS[1]) return 0;
  if (elapsedMs < CHAT_TOOL_STAGE_MS[2]) return 1;
  if (elapsedMs < CHAT_TOOL_STAGE_MS[3]) return 2;
  return 3;
}

export function remainingChatToolProgressMs(status?: ChatRunStatus) {
  if (!status?.tool || status.status !== "running") return 0;
  return Math.max(0, CHAT_TOOL_MIN_PROGRESS_MS - (Date.now() - status.startedAt));
}

export function chatToolRunKey(status?: ChatRunStatus): ChatToolRunKey | null {
  if (!status?.tool || status.status !== "running") return null;
  return {
    mode: status.mode,
    route: status.route,
    startedAt: status.startedAt,
    tool: status.tool
  };
}

export function isSameRunningChatToolRun(status: ChatRunStatus | undefined, key: ChatToolRunKey | null) {
  if (!key) return true;
  return Boolean(
    status?.status === "running"
    && status.mode === key.mode
    && status.route === key.route
    && status.startedAt === key.startedAt
    && status.tool === key.tool
  );
}
