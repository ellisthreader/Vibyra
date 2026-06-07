import { useEffect } from "react";
import { Agent, AgentConnection, LogEvent, PreviewState } from "../types/domain";

type Connection = AgentConnection | null;
type Setters = {
  setLogs: (events: LogEvent[]) => void;
  setPreviewState: (state: PreviewState) => void;
  setSelectedProjectId: (id: string) => void;
  setAgents: (updater: (current: Agent[]) => Agent[]) => void;
};
type Requests = {
  agentRequest: <T>(endpoint: string, options?: RequestInit, useAuth?: boolean) => Promise<T>;
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
  model: string;
  title?: string;
  state?: Agent["state"];
  progress?: number;
  file?: string;
};

export function useLiveSync(connection: Connection, requests: Requests, setters: Setters, onConnectionLost: () => void) {
  useEffect(() => {
    if (!connection) return undefined;

    let cancelled = false;
    let failedPolls = 0;
    let inFlight = false;
    const interval = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await requests.agentRequest<EventsResult>("/events");
        if (cancelled) return;
        failedPolls = 0;
        setters.setLogs(result.events);
        if (result.preview?.state) setters.setPreviewState(result.preview.state);
        const activeAgentRun = result.activeAgentRun;
        if (activeAgentRun?.projectId && result.selectedProjectId === activeAgentRun.projectId) {
          setters.setSelectedProjectId(activeAgentRun.projectId);
        }
        if (activeAgentRun) {
          setters.setAgents((current) => syncLiveAgentProgress(current, activeAgentRun));
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "";
        if (isInvalidDesktopToken(message)) {
          return;
        }
        failedPolls += 1;
        if (failedPolls < 3) return;
        onConnectionLost();
      } finally {
        inFlight = false;
      }
    }, 2200);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connection, requests, setters, onConnectionLost]);
}

function isInvalidDesktopToken(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("secure desktop session expired") || lower.includes("missing or invalid desktop token") || lower.includes("unauthorized") || lower.includes("401");
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
      chatProjectId: agent.chatProjectId ?? run.projectId,
      startedAt: agent.startedAt ?? Date.now(),
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
      chatProjectId: run.projectId,
      startedAt: Date.now(),
      state: run.state ?? "running",
      progress,
      file: run.file ?? "OpenAI stream"
    },
    ...agents
  ];
}
