import type Ionicons from "@expo/vector-icons/Ionicons";
import type { LogEvent, Project } from "./domain";

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
