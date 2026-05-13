import { LogEvent } from "../types/domain";
import type { AgentStartTarget } from "./appContextTypes";
import { useAppState } from "./useAppState";

type Store = ReturnType<typeof useAppState>;
type Requests = {
  agentRequest: <T>(endpoint: string, options?: RequestInit, useAuth?: boolean) => Promise<T>;
};
type Logs = {
  appendLogs: (logs: Omit<LogEvent, "id" | "time">[]) => void;
};

export type TerminalCommandResult = {
  ok: boolean;
  command: string;
  output: string;
  event?: Omit<LogEvent, "id" | "time"> & Partial<Pick<LogEvent, "id" | "time">>;
  buildState?: "idle" | "passed" | "failed";
};

export function useTerminalCommandActions(store: Store, requests: Requests, logs: Logs) {
  const { state, setters } = store;

  async function runTerminalCommand(command: string, target?: AgentStartTarget): Promise<TerminalCommandResult> {
    if (!state.connection) throw new Error("Connect Vibyra Desktop before running terminal commands.");
    const projectId = target?.projectId ?? target?.project?.id ?? state.selectedProjectId;
    if (!projectId) throw new Error("Open a project before running terminal commands.");
    const result = await requests.agentRequest<TerminalCommandResult>("/commands/run", {
      method: "POST",
      body: JSON.stringify({ projectId, command })
    });
    if (result.buildState) setters.setBuildState(result.buildState);
    if (result.event) logs.appendLogs([{
      source: result.event.source,
      message: result.event.message,
      tone: result.event.tone
    }]);
    return result;
  }

  return { runTerminalCommand };
}
