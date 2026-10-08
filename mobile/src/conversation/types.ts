export type RequestStatus =
  'pending' | 'resolving' | 'accepted' | 'declined' | 'expired' | 'unknown';
type ItemIdentity = { id: string; turnId: string };
export type ConversationMessage = ItemIdentity & {
  kind: 'message';
  role: 'user' | 'assistant';
  text: string;
  source?: import('../state/conversationTypes').AgentItem;
};
export type ConversationActivity = ItemIdentity & {
  kind: 'activity';
  title: string;
  detail?: string;
  status: 'running' | 'completed' | 'failed' | 'interrupted' | 'declined';
  source?: import('../state/conversationTypes').AgentItem;
};
export type ConversationPermission = ItemIdentity & {
  kind: 'permission';
  title: string;
  reason?: string;
  scope?: string;
  detail?: string;
  allowLabel?: string;
  source?: import('../state/conversationTypes').AgentItem;
  choices?: string[];
  status: RequestStatus;
};
export type ConversationQuestion = ItemIdentity & {
  kind: 'question';
  title: string;
  status: RequestStatus;
  questions: {
    id: string;
    prompt: string;
    options: { id: string; label: string; description?: string }[];
    allowFreeform?: boolean;
    secret?: boolean;
  }[];
};
export type ConversationResult = ItemIdentity & {
  kind: 'result';
  source?: import('../state/conversationTypes').AgentItem;
  text: string;
  status: 'completed' | 'failed' | 'interrupted';
  checks?: string[];
};
export type ConversationItem =
  | ConversationMessage
  | ConversationActivity
  | ConversationPermission
  | ConversationQuestion
  | ConversationResult;
export type ConversationStatus = 'idle' | 'working' | 'waiting' | 'error';
export type ConversationViewProps = {
  turnId?: string | null;
  memoryKey?: string;
  items: ConversationItem[];
  status: ConversationStatus;
  connected: boolean;
  canRespond: boolean;
  onDecision: (id: string, decision: 'accept' | 'decline' | 'acceptForSession') => Promise<void>;
  onAnswer: (id: string, answers: Record<string, string[]>) => Promise<void>;
  onInspect?: (item: import('../state/conversationTypes').AgentItem) => void;
  onReview?: () => void;
  hasEarlier?: boolean;
  onLoadEarlier?: () => Promise<void>;
};
