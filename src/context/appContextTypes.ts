import {
  Agent,
  AgentConnection,
  BuildState,
  ChatMessage,
  CodeChange,
  FileEntry,
  LogEvent,
  ModelKey,
  PairApprovalPayload,
  PreviewState,
  Project,
  ReasoningEffort
} from "../types/domain";

export type AppState = {
  authenticated: boolean;
  authMode: "login" | "signup";
  authName: string;
  authEmail: string;
  authPassword: string;
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
  machineName: string;
  projects: Project[];
  selectedProjectId: string;
  selectedModel: ModelKey;
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
  newFilePath: string;
  command: string;
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
  setReasoningEffort: (effort: ReasoningEffort) => void;
  setTaskText: (task: string) => void;
  setNewFilePath: (path: string) => void;
};

export type AppActions = {
  authenticateWith: (method: "apple" | "google" | "email") => void;
  confirmPhonePermission: () => void;
  pairMachine: () => Promise<void>;
  testDesktopConnection: () => Promise<boolean>;
  createProject: () => Promise<void>;
  createFile: () => Promise<void>;
  selectFile: (fileId: string) => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  startAgent: () => Promise<void>;
};

export type AppContextValue = AppState & AppDerivedState & AppSetters & AppActions;
