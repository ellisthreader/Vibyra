import type { useAppState } from "./useAppState";
import type { AgentStartTarget } from "./appContextTypes";

export type LocalChatStore = ReturnType<typeof useAppState>;
export type ResolveChatTarget = (target?: AgentStartTarget) => { projectId: string; file?: string };
