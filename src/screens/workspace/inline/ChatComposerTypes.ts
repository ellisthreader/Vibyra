import type { ChatSkill } from "../../../utils/appApi";
import type {
  ChatFileAttachment,
  ChatImageAttachment,
  ChatStartOptions,
  ChatToolMode,
} from "../../../types/chatTools";
import type { ChatMessage, ModelKey, ReasoningEffort } from "../../../types/domain";
import type { ChatToolPlanPreview } from "./ChatToolPlanCard";

export type ChatComposerProps = {
  accountPlan: string;
  agentRequesting: boolean;
  bottomInset: number;
  chatMessages: ChatMessage[];
  chatSkills: ChatSkill[];
  creditPercentRemaining: number;
  creditsLow: boolean;
  onNewChat: () => void;
  onOpenPcConnection: () => void;
  projectId?: string;
  onOpenFolderCommand: () => void;
  onTestPreviewCommand: (userText: string) => void;
  onOpenTokens: () => void;
  onToolPreviewChange?: (preview: ChatToolPlanPreview | null) => void;
  onStart: (options?: ChatStartOptions) => void;
  reasoningEffort: ReasoningEffort;
  selectedChatModel: string;
  selectedModel: ModelKey;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  setSelectedChatModel: (model: string) => void;
  setSelectedModel: (model: ModelKey) => void;
  setTaskText: (value: string) => void;
  taskText: string;
};

export type ComposerAttachments = {
  files: ChatFileAttachment[];
  images: ChatImageAttachment[];
};

export type ComposerToolSelection = {
  active: ChatToolMode | null;
  previousModel: string | null;
};
