import type {
  Agent, AgentConnection, BuildState, ChatMessage, CodeChange, DesktopPermissionMode,
  FileEntry, LogEvent, ModelKey, PairApprovalPayload, PreviewState, Project,
  ProjectMemory, RememberedDesktop, ReasoningEffort
} from "../types/domain";
import type { ChatSkill, LevelProgress } from "../utils/appApi";

export type AppState = {
  persistenceReady: boolean;
  authenticated: boolean;
  authToken: string;
  installId: string;
  accountId: number | null;
  accountPlan: string;
  levelProgress?: LevelProgress;
  authMode: "login" | "signup";
  authName: string;
  authEmail: string;
  authPassword: string;
  authReferralCode: string;
  profileImageUri: string;
  creditsBalance: number;
  creditsUsed: number;
  dailyCreditsUsed: number;
  dailyCreditsCap: number;
  dailyCreditsResetAt: string | null;
  burstCreditsUsed: number;
  burstCreditsCap: number;
  burstCreditsResetAt: string | null;
  burstWindowHours: number;
  weeklyCreditsUsed: number;
  weeklyCreditsCap: number;
  weeklyCreditsResetAt: string | null;
  onboardingComplete: boolean;
  pcSetupComplete: boolean;
  pcSetupSkipped: boolean;
  paired: boolean;
  agentUrl: string;
  pairCode: string;
  pairing: boolean;
  pairingError: string;
  pairingMessage: string;
  healthMessage: string;
  checkingHealth: boolean;
  pendingPhoneApproval: PairApprovalPayload | null;
  connection: AgentConnection | null;
  desktopPermissionMode: DesktopPermissionMode;
  rememberedDesktops: RememberedDesktop[];
  machineName: string;
  projects: Project[];
  selectedProjectId: string;
  selectedModel: ModelKey;
  selectedChatModel: string;
  reasoningEffort: ReasoningEffort;
  agents: Agent[];
  logs: LogEvent[];
  files: FileEntry[];
  changes: CodeChange[];
  selectedFileId: string;
  buildState: BuildState;
  previewState: PreviewState;
  workflowIndex: number;
  lastPrompt: string;
  agentRequesting: boolean;
  taskText: string;
  chatMessages: ChatMessage[];
  chatThreads: Record<string, ChatMessage[]>;
  chatTitles: Record<string, string>;
  detachedChatThreads: Record<string, ChatMessage[]>;
  detachedChatTitles: Record<string, string>;
  detachedChatUpdatedAt: Record<string, number>;
  chatSkills: ChatSkill[];
  chatProjects: Record<string, Project>;
  editApprovals: Record<string, "always">;
  projectMemories: Record<string, ProjectMemory>;
  newFilePath: string;
  command: string;
  promptMoney: { total: number; count: number; lastEarned: number; longestPromptLength: number };
};

export type AppDerivedState = {
  selectedProject: Project;
  selectedFile: FileEntry;
  activeAgents: Agent[];
  latestOutput: string;
};
