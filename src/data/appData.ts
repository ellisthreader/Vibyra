import { Agent, CodeChange, FileEntry, LogEvent, ModelKey, Project, ReasoningEffort } from "../types/domain";

export const DESKTOP_RELAY_URL = process.env.EXPO_PUBLIC_DESKTOP_RELAY_URL ?? "";
export const models: ModelKey[] = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5-codex"];
export const reasoningEfforts: ReasoningEffort[] = ["none", "low", "medium", "high", "xhigh"];

export const starterProjects: Project[] = [];

export const starterAgents: Agent[] = [];

export const starterLogs: LogEvent[] = [];

export const starterFiles: FileEntry[] = [];

export const starterChanges: CodeChange[] = [];
