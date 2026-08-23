import { useCallback, useMemo } from "react";
import { LogEvent } from "../types/domain";
import { makeId } from "../utils/ids";
import { useAppState } from "./useAppState";

type Setters = ReturnType<typeof useAppState>["setters"];

export function useLogActions(setters: Setters) {
  const { setLogs, setWorkflowIndex } = setters;
  const appendLog = useCallback((message: string, source = "Vibyra", tone: LogEvent["tone"] = "info") => {
    setLogs((current) => [
      { id: makeId("log"), source, message, tone, time: "Now" },
      ...current.slice(0, 20)
    ]);
  }, [setLogs]);

  const appendLogs = useCallback((nextLogs: Omit<LogEvent, "id" | "time">[]) => {
    setLogs((current) => [
      ...nextLogs.map((log) => ({ id: makeId("log"), time: "Now", ...log })),
      ...current.slice(0, 20)
    ]);
  }, [setLogs]);

  const advanceWorkflow = useCallback((index: number) => {
    setWorkflowIndex((current) => Math.max(current, index));
  }, [setWorkflowIndex]);

  return useMemo(() => ({ appendLog, appendLogs, advanceWorkflow }), [advanceWorkflow, appendLog, appendLogs]);
}
