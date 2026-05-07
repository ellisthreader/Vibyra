import { useEffect } from "react";
import { Agent, LogEvent, ModelKey, PreviewState } from "../types/domain";

type Connection = { url: string; token: string; machineName: string } | null;
type Setters = {
  setLogs: (events: LogEvent[]) => void;
  setPreviewState: (state: PreviewState) => void;
  setSelectedProjectId: (id: string) => void;
  setAgents: (updater: (current: Agent[]) => Agent[]) => void;
};
type Requests = {
  agentRequest: <T>(endpoint: string, options?: RequestInit, useAuth?: boolean) => Promise<T>;
};
type Logs = {
  appendLog: (message: string, source?: string, tone?: LogEvent["tone"]) => void;
};

type EventsResult = {
  events: LogEvent[];
  preview: { state: PreviewState } | null;
  selectedProjectId: string | null;
  activeAgentRun: ActiveAgentRun | null;
};

type ActiveAgentRun = {
  id: string;
  projectId: string;
  model: ModelKey;
  title?: string;
  state?: Agent["state"];
  progress?: number;
  file?: string;
};

export function useLiveSync(connection: Connection, requests: Requests, setters: Setters, logs: Logs) {
  useEffect(() => {
    if (!connection) return undefined;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const result = await requests.agentRequest<EventsResult>("/events");
        if (cancelled) return;
        setters.setLogs(result.events);
        if (result.preview?.state) setters.setPreviewState(result.preview.state);
        if (result.selectedProjectId) setters.setSelectedProjectId(result.selectedProjectId);
        const activeAgentRun = result.activeAgentRun;
        if (activeAgentRun) {
          setters.setAgents((current) => syncLiveAgentProgress(current, activeAgentRun));
        }
      } catch {
        if (!cancelled) logs.appendLog("Live Vibyra updates paused", "Desktop", "warning");
      }
    }, 2200);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connection, requests, setters, logs]);
}

function syncLiveAgentProgress(agents: Agent[], run: ActiveAgentRun) {
  const progress = Math.max(12, Math.min(96, Math.round(run.progress ?? 12)));
  let matched = false;
  const nextAgents = agents.map((agent) => {
    const sameRun = agent.id === run.id;
    const sameRunningProject = !matched && (agent.state === "running" || agent.state === "waiting") && agent.projectId === run.projectId;

    if (!sameRun && !sameRunningProject) return agent;

    matched = true;
    return {
      ...agent,
      file: run.file ?? agent.file,
      model: run.model ?? agent.model,
      progress: Math.max(agent.progress, progress),
      projectId: run.projectId,
      state: run.state ?? "running",
      title: run.title ?? agent.title
    };
  });

  if (matched) return nextAgents;

  return [
    {
      id: run.id,
      title: run.title ?? "AI build in progress",
      model: run.model,
      projectId: run.projectId,
      state: run.state ?? "running",
      progress,
      file: run.file ?? "OpenAI stream"
    },
    ...agents
  ];
}
