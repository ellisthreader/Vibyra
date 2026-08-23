import type { ChatStartOptions } from "../../../types/chatTools";
import type {
  ChatMessage, DesktopBrowseListing, DesktopConnectionPrompt, FileEntry,
  GeneratedApp, ModelKey, Project, ReasoningEffort
} from "../../../types/domain";
import type { ChatSkill } from "../../../utils/appApi";

export type AIChatPageProps = {
  accountPlan: string;
  agentRequesting: boolean;
  bottomInset: number;
  chatMessages: ChatMessage[];
  chatSkills: ChatSkill[];
  creditsLow: boolean;
  creditPercentRemaining: number;
  onOpenApp: (app: GeneratedApp) => void;
  onAcceptFolderProposal: (proposalId: string, folder: Project) => void;
  onBrowseDesktopPath: (path?: string) => Promise<DesktopBrowseListing>;
  onConnectDesktop: (messageId: string, prompt: DesktopConnectionPrompt) => void;
  onDismissFolderProposal: (proposalId: string) => void;
  onScanForDesktop: (messageId: string, prompt: DesktopConnectionPrompt) => void;
  onSearchFolderProposal: (proposalId: string, query: string, excludeProjectId?: string) => void;
  onUndoCodeChange: (projectId: string, messageId: string, changeId: string, file: FileEntry) => Promise<void>;
  onRevertPreviewCode: (messageId: string) => void;
  onApproveEdits: (messageId: string, projectId: string, alwaysAllow: boolean) => Promise<void>;
  onDenyEdits: (messageId: string, projectId: string) => Promise<void>;
  onWrongFolderProposal: (proposalId: string, folder: Project, query: string) => void;
  projectName?: string;
  onOpenTokens: () => void;
  onOpenPcConnection: () => void;
  onApprovePreviewServerStart: () => void;
  onDenyPreviewServerStart: () => void;
  onStart: (options?: ChatStartOptions) => void;
  onTestPreviewCommand: (userText: string) => void;
  projectChatTitles: Record<string, string>;
  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  selectedChatModel: string;
  selectedChatId: string | null;
  selectedFileName: string;
  selectedModel: ModelKey;
  setSelectedChatId: (chatId: string | null) => void;
  setSelectedChatModel: (model: string) => void;
  setSelectedModel: (model: ModelKey) => void;
  setTaskText: (value: string) => void;
  taskText: string;
};
