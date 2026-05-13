import { Ionicons } from "@expo/vector-icons";
import type { ProjectAnalysis, ProjectBriefSetupPrompt } from "./projectAnalysis";

export type AgentState = "running" | "waiting" | "complete" | "failed";
export type BuildState = "idle" | "building" | "passed" | "failed";
export type ModelKey = "gpt-5.5" | "gpt-5.4" | "gpt-5.4-mini" | "gpt-5.4-nano" | "gpt-5-codex";
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
export type PreviewState = "offline" | "live" | "refreshing" | "delivered";

export type ProjectSource = "pc" | "mobile" | "desktop";

export type ProjectBrief = {
  kindId: string;
  kindLabel: string;
  frameworkId: string;
  frameworkLabel: string;
  frameworkDescription: string;
};

export type Project = {
  id: string;
  name: string;
  path: string;
  stack: string;
  updated: string;
  source?: ProjectSource;
  analysis?: ProjectAnalysis;
  brief?: ProjectBrief;
  briefRequired?: boolean;
  briefRequiredFilePath?: string;
  briefedFilePaths?: string[];
  detectedBrief?: ProjectBrief | null;
};

export type DesktopBrowseEntry = {
  id: string;
  name: string;
  path: string;
  kind: "folder" | "file";
  stack: string;
  updated: string;
  source?: ProjectSource;
  analysis?: ProjectAnalysis;
  brief?: ProjectBrief;
  briefRequired?: boolean;
  briefRequiredFilePath?: string;
  briefedFilePaths?: string[];
  detectedBrief?: ProjectBrief | null;
};

export type DesktopBrowseListing = {
  current: Project | null;
  parentPath: string | null;
  entries: DesktopBrowseEntry[];
};

export type Agent = {
  id: string;
  title: string;
  model: string;
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
  previousBody?: string | null;
};

export type FolderProposal = {
  id: string;
  status: "pending" | "accepted" | "dismissed";
  matches: Project[];
  selectedIndex: number;
  query?: string;
  error?: string;
};

export type FolderRecovery = {
  id: string;
  proposalId: string;
  query: string;
  excludedProjectId?: string;
};

export type DesktopConnectionPrompt = {
  query?: string;
  reason: "desktop-search" | "desktop-browse" | "desktop-agent";
  stage?: "connect" | "pair" | "open";
};

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  file?: string;
  assistantModel?: string;
  runStatus?: ChatRunStatus;
  app?: GeneratedApp;
  codeChanges?: CodeChange[];
  codeFiles?: FileEntry[];
  codeProjectId?: string;
  pendingApplyId?: string;
  undoneChangeIds?: string[];
  editApproval?: "pending" | "allowed" | "denied";
  folderProposal?: FolderProposal;
  folderRecovery?: FolderRecovery;
  projectBriefSetup?: ProjectBriefSetupPrompt;
  desktopConnection?: DesktopConnectionPrompt;
  agentBusy?: AgentBusyInfo;
};

export type ChatRunStatus = {
  startedAt: number;
  completedAt?: number;
  activeFile?: string;
  route: "desktop" | "cloud";
  mode: "build" | "chat";
  status: "running" | "complete" | "failed";
};

export type AgentBusyInfo = {
  reason?: "active-run" | "lock" | string;
  runId?: string | null;
  title?: string | null;
  model?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  projectPath?: string | null;
  state?: string | null;
  progress?: number | null;
  file?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  elapsedSeconds?: number | null;
};

export type GeneratedApp = {
  id: string;
  title: string;
  html?: string;
  url?: string;
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
  connectionUrls?: string[];
};

export type DesktopStatus = "current" | "online" | "offline" | "checking";

export type RememberedDesktop = {
  url: string;
  machineName: string;
  pairCode: string;
  connectionUrls?: string[];
  token?: string;
  status: DesktopStatus;
  lastSeenAt?: string;
  lastConnectedAt?: string;
};

export type PairApprovalPayload = {
  url: string;
  token: string;
  machineName: string;
  connectionUrls?: string[];
  projects: Project[];
  events: LogEvent[];
};

export type PairResponse = {
  status: "pending" | "approved";
  requestId?: string;
  token?: string;
  machineName: string;
  projects?: Project[];
  events?: LogEvent[];
};

export type TabDefinition = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};
