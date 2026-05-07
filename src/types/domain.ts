import { Ionicons } from "@expo/vector-icons";

export type AgentState = "running" | "waiting" | "complete" | "failed";
export type BuildState = "idle" | "building" | "passed" | "failed";
export type ModelKey = "gpt-5.5" | "gpt-5.4" | "gpt-5.4-mini" | "gpt-5.4-nano" | "gpt-5-codex";
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
export type PreviewState = "offline" | "live" | "refreshing" | "delivered";

export type ProjectSource = "pc" | "mobile" | "desktop";

export type Project = {
  id: string;
  name: string;
  path: string;
  stack: string;
  updated: string;
  source?: ProjectSource;
};

export type Agent = {
  id: string;
  title: string;
  model: ModelKey;
  projectId: string;
  state: AgentState;
  progress: number;
  file: string;
};

export type LogEvent = {
  id: string;
  source: string;
  message: string;
  tone: "info" | "success" | "warning" | "error";
  time: string;
};

export type FileEntry = {
  id: string;
  name: string;
  path: string;
  language: string;
  changed: "added" | "modified" | "clean";
  body: string;
};

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  file?: string;
  app?: GeneratedApp;
};

export type GeneratedApp = {
  id: string;
  title: string;
  html: string;
};

export type CodeChange = {
  id: string;
  file: string;
  summary: string;
  additions: number;
  deletions: number;
  status: "pending" | "applied";
};

export type AgentConnection = {
  url: string;
  token: string;
  machineName: string;
};

export type DesktopStatus = "current" | "online" | "offline" | "checking";

export type RememberedDesktop = {
  url: string;
  machineName: string;
  pairCode: string;
  status: DesktopStatus;
  lastSeenAt?: string;
  lastConnectedAt?: string;
};

export type PairApprovalPayload = {
  url: string;
  token: string;
  machineName: string;
  projects: Project[];
  events: LogEvent[];
};

export type PairResponse = {
  status: "pending" | "approved";
  requestId?: string;
  token: string;
  machineName: string;
  projects: Project[];
  events: LogEvent[];
};

export type TabDefinition = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};
