import { LogEvent } from "../types/domain";
import { makeId } from "../utils/ids";
import { useAppState } from "./useAppState";

type Setters = ReturnType<typeof useAppState>["setters"];

export function useLogActions(setters: Setters) {
  function appendLog(message: string, source = "Vibyra", tone: LogEvent["tone"] = "info") {
    setters.setLogs((current) => [
      { id: makeId("log"), source, message, tone, time: "Now" },
      ...current.slice(0, 20)
    ]);
  }

  function appendLogs(nextLogs: Omit<LogEvent, "id" | "time">[]) {
    setters.setLogs((current) => [
      ...nextLogs.map((log) => ({ id: makeId("log"), time: "Now", ...log })),
      ...current.slice(0, 20)
    ]);
  }

  function advanceWorkflow(index: number) {
    setters.setWorkflowIndex((current) => Math.max(current, index));
  }

  return { appendLog, appendLogs, advanceWorkflow };
}
