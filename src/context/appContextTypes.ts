import {
  Agent,
  AgentConnection,
  BuildState,
  ChatMessage,
  CodeChange,
  DesktopBrowseListing,
  FileEntry,
  FolderProposal,
  FolderRecovery,
  GeneratedApp,
  LogEvent,
  ModelKey,
  PairApprovalPayload,
  PreviewState,
  Project,
  RememberedDesktop,
  ReasoningEffort
} from "../types/domain";

export type AppState = {
  authenticated: boolean;
  authToken: string;
  installId: string;
  accountId: number | null;
  accountPlan: string;
  authMode: "login" | "signup";
  authName: string;
  authEmail: string;
  authPassword: string;
  creditsBalance: number;
  creditsUsed: number;
  onboardingComplete: boolean;
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
  chatSkills: import("../utils/appApi").ChatSkill[];
  chatProjects: Record<string, Project>;
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
  setAgentUrl: (url: string) => void;
  setPairCode: (code: string) => void;
  setSelectedModel: (model: ModelKey) => void;
  setSelectedChatModel: (model: string) => void;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  setTaskText: (task: string) => void;
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
  applyRemoteUserFromIap: (user: import("../utils/appApi").RemoteUser) => void;
  confirmPhonePermission: () => void;
  discoverPairableDesktops: () => Promise<RememberedDesktop[]>;
  connectRememberedDesktop: (desktop: RememberedDesktop) => Promise<boolean>;
  pairMachine: () => Promise<void>;
  pairMachineAt: (url: string, code: string) => Promise<void>;
  testDesktopConnection: () => Promise<boolean>;
  createProject: () => Promise<Project | null>;
  createFile: () => Promise<void>;
  selectFile: (fileId: string) => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  startAgent: (target?: AgentStartTarget) => Promise<void>;
  clearCurrentChat: (projectId?: string) => void;
  addLocalChatReply: (prompt: string, reply: string, target?: AgentStartTarget, app?: GeneratedApp) => void;
  addLocalChatProposal: (prompt: string, reply: string, matches: Project[], target?: AgentStartTarget, query?: string) => { proposalProjectId: string };
  addLocalFolderRecovery: (prompt: string, reply: string, recovery: FolderRecovery, target?: AgentStartTarget) => void;
  resolveFolderProposal: (proposalId: string, status: "accepted" | "dismissed", projectId?: string) => void;
  updateFolderProposal: (proposalId: string, update: Partial<FolderProposal>, projectId?: string) => void;
  undoCodeChange: (projectId: string, messageId: string, changeId: string, file: FileEntry) => Promise<void>;
  resetPromptMoney: () => void;
  browseDesktopPath: (path?: string) => Promise<DesktopBrowseListing>;
  loadDesktopFolders: () => Promise<Project[]>;
  searchDesktopFolders: (query: string) => Promise<Project[]>;
  adoptProject: (project: Project) => Promise<void>;
  signOut: () => void;
  updateProfile: (changes: { name?: string; email?: string; machineName?: string }) => void;
};

export type AppContextValue = AppState & AppDerivedState & AppSetters & AppActions;
