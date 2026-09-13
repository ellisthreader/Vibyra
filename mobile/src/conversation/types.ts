export type RequestStatus = 'pending' | 'resolving' | 'accepted' | 'declined' | 'expired' | 'unknown';
type ItemIdentity = { id: string; turnId: string };
export type ConversationMessage = ItemIdentity & {
  kind: 'message'; role: 'user' | 'assistant'; text: string;
};
export type ConversationActivity = ItemIdentity & {
  kind: 'activity'; title: string; detail?: string; status: 'running' | 'completed' | 'failed';
};
export type ConversationPermission = ItemIdentity & {
  kind: 'permission'; title: string; reason?: string; scope?: string; detail?: string; status: RequestStatus;
};
export type ConversationQuestion = ItemIdentity & {
  kind: 'question'; title: string; status: RequestStatus;
  questions: { id: string; prompt: string; options: { id: string; label: string; description?: string }[];
    allowFreeform?: boolean; secret?: boolean }[];
};
export type ConversationResult = ItemIdentity & {
  kind: 'result'; text: string; status: 'completed' | 'failed' | 'interrupted'; checks?: string[];
};
export type ConversationItem = ConversationMessage | ConversationActivity | ConversationPermission
  | ConversationQuestion | ConversationResult;
export type ConversationStatus = 'idle' | 'working' | 'waiting' | 'error';
export type ConversationViewProps = {
  items: ConversationItem[]; status: ConversationStatus; connected: boolean; canRespond: boolean;
  onDecision: (id: string, decision: 'accept' | 'decline') => Promise<void>;
  onAnswer: (id: string, answers: Record<string, string[]>) => Promise<void>;
  onReview?: () => void;
  hasEarlier?: boolean; onLoadEarlier?: () => Promise<void>;
};
