import {
  Agent,
  AgentConnection,
  BuildState,
  ChatMessage,
  CodeChange,
  DesktopBrowseListing,
  DesktopConnectionPrompt,
  FileEntry,
  FolderProposal,
  FolderRecovery,
  GeneratedApp,
  LogEvent,
  ModelKey,
  PairApprovalPayload,
  PreviewState,
  Project,
  ProjectBrief,
  ProjectMemory,
  PreviewServerPhase,
  PreviewServerPrompt,
  RememberedDesktop,
  ReasoningEffort,
  DesktopPermissionMode
} from "../types/domain";
import type { AgentStartOptions } from "../types/chatTools";

export type ProjectOpenOptions = { startPreview?: boolean };

export type AppState = {
  persistenceReady: boolean;
  authenticated: boolean;
  authToken: string;
  installId: string;
  accountId: number | null;
  accountPlan: string;
  levelProgress?: import("../utils/appApi").LevelProgress;
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
  chatSkills: import("../utils/appApi").ChatSkill[];
  chatProjects: Record<string, Project>;
  editApprovals: Record<string, "always">;
  projectMemories: Record<string, ProjectMemory>;
  newFilePath: string;
  command: string;
  promptMoney: {
    total: number;
    count: number;
    lastEarned: number;
    longestPromptLength: number;
  };
};

export type AppDerivedState = {
  selectedProject: Project;
  selectedFile: FileEntry;
  activeAgents: Agent[];
  latestOutput: string;
};

export type AppSetters = {
  setAuthMode: (mode: "login" | "signup") => void;
  setAuthName: (name: string) => void;
  setAuthEmail: (email: string) => void;
  setAuthPassword: (password: string) => void;
  setAuthReferralCode: (code: string) => void;
  setAgentUrl: (url: string) => void;
  setPairCode: (code: string) => void;
  setSelectedModel: (model: ModelKey) => void;
  setSelectedChatModel: (model: string) => void;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  setDesktopPermissionMode: (mode: DesktopPermissionMode, projectId?: string) => void;
  setTaskText: (task: string) => void;
  setDetachedChatThreads: (update: Record<string, ChatMessage[]> | ((current: Record<string, ChatMessage[]>) => Record<string, ChatMessage[]>)) => void;
  setDetachedChatTitles: (update: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
  setDetachedChatUpdatedAt: (update: Record<string, number> | ((current: Record<string, number>) => Record<string, number>)) => void;
  setNewFilePath: (path: string) => void;
};

export type AgentStartTarget = {
  projectId?: string;
  project?: Project;
  chatProjectId?: string;
  file?: FileEntry | null;
};

export type AppActions = {
  authenticateWith: (method: "apple" | "google" | "microsoft" | "email", accountStatus?: "new" | "existing") => Promise<void>;
  completeOnboarding: () => void;
  completePcSetup: () => void;
  skipPcSetup: () => void;
  applyRemoteUserFromIap: (user: import("../utils/appApi").RemoteUser) => void;
  applyRemoteUsage: (user: import("../utils/appApi").RemoteUser) => void;
  expireSession: (message?: string) => void;
  confirmPhonePermission: () => void;
  discoverPairableDesktops: () => Promise<RememberedDesktop[]>;
  connectRememberedDesktop: (desktop: RememberedDesktop) => Promise<boolean>;
  disconnectDesktop: () => void;
  pairMachine: () => Promise<boolean>;
  pairMachineAt: (url: string, code: string) => Promise<boolean>;
  testDesktopConnection: () => Promise<boolean>;
  createProject: (name?: string) => Promise<Project | null>;
  createFile: () => Promise<void>;
  selectFile: (fileId: string) => Promise<void>;
  selectProject: (projectId: string, projectOrOptions?: Project | ProjectOpenOptions, options?: ProjectOpenOptions) => Promise<FileEntry[]>;
  loadProjectReviewFiles: (projectId: string) => Promise<{ files: Pick<FileEntry, "body" | "language" | "path">[]; totalFiles?: number; truncated?: boolean }>;
  startPreviewServer: (projectId: string, projectName?: string, onProgress?: (phase: PreviewServerPhase, detail?: string) => void) => Promise<GeneratedApp>;
  startAgent: (target?: AgentStartTarget, promptOverride?: string, options?: AgentStartOptions) => Promise<boolean>;
  clearCurrentChat: (projectId?: string) => void;
  addLocalUserMessage: (prompt: string, target?: AgentStartTarget) => void;
  addLocalChatNotice: (prompt: string, reply: string, target?: AgentStartTarget, app?: GeneratedApp) => void;
  addLocalChatReply: (prompt: string, reply: string, target?: AgentStartTarget, app?: GeneratedApp) => void;
  addLocalGeneratedImage: (prompt: string, image: import("../types/chatTools").GeneratedImage, target?: AgentStartTarget) => void;
  addLocalImageGenerationPending: (prompt: string, target?: AgentStartTarget) => string;
  finishLocalGeneratedImage: (messageId: string, image: import("../types/chatTools").GeneratedImage, target?: AgentStartTarget) => void;
  failLocalImageGeneration: (messageId: string, error: string, target?: AgentStartTarget) => void;
  addLocalPreviewServerPrompt: (prompt: string, target?: AgentStartTarget) => string;
  updatePreviewServerMessage: (messageId: string, projectId: string, update: Partial<PreviewServerPrompt>, app?: GeneratedApp) => void;
  addLocalChatProposal: (prompt: string, reply: string, matches: Project[], target?: AgentStartTarget, query?: string) => { proposalProjectId: string };
  addLocalDesktopConnectionPrompt: (prompt: string, connectionPrompt: DesktopConnectionPrompt, target?: AgentStartTarget) => void;
  addLocalFolderRecovery: (prompt: string, reply: string, recovery: FolderRecovery, target?: AgentStartTarget) => void;
  replaceDesktopConnectionWithProposal: (messageId: string, reply: string, matches: Project[], query: string, projectId?: string) => void;
  resolveFolderProposal: (proposalId: string, status: "accepted" | "dismissed", projectId?: string) => void;
  updateDesktopConnectionPrompt: (messageId: string, update: Partial<DesktopConnectionPrompt>, projectId?: string) => void;
  updateFolderProposal: (proposalId: string, update: Partial<FolderProposal>, projectId?: string) => void;
  undoCodeChange: (projectId: string, messageId: string, changeId: string, file: FileEntry) => Promise<void>;
  revertPreviewCode: (messageId: string) => void;
  clearCache: () => void;
  resetPromptMoney: () => void;
  reportLevelActivity: (action: string, contextId: string, meta?: Record<string, unknown>) => void;
  runTerminalCommand: (command: string, target?: AgentStartTarget) => Promise<import("./useTerminalCommandActions").TerminalCommandResult>;
  browseDesktopPath: (path?: string) => Promise<DesktopBrowseListing>;
  analyzeDesktopProject: (project: Project) => Promise<Project>;
  loadDesktopFolders: () => Promise<Project[]>;
  searchDesktopFolders: (query: string) => Promise<Project[]>;
  adoptProject: (project: Project, options?: ProjectOpenOptions) => Promise<void>;
  rememberProject: (project: Project) => void;
  saveProjectBrief: (projectId: string, brief: ProjectBrief) => void;
  addProjectBriefSetupMessage: (project: Project) => void;
  updateProjectBriefSetupMessage: (project: Project) => void;
  rememberProjectMemory: (projectId: string, text: string) => void;
  forgetProjectMemory: (projectId: string, entryId: string) => void;
  approveEdits: (messageId: string, projectId: string, alwaysAllow: boolean) => Promise<void>;
  denyEdits: (messageId: string, projectId: string) => Promise<void>;
  signOut: () => void;
  updateProfile: (changes: { name?: string; email?: string; machineName?: string; profileImageUri?: string }) => void;
};

export type AppContextValue = AppState & AppDerivedState & AppSetters & AppActions;
