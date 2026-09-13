export interface AgentItem {
  id: string; turnId: string; cursor?: number; order?: number;
  kind: 'message' | 'activity' | 'permission' | 'question' | 'result';
  role?: 'user' | 'assistant'; text?: string; title?: string; detail?: string; scope?: string; truncated?: boolean;
  status: string; requestId?: string; actionVersion?: string;
  questions?: { id: string; header?: string; question: string;
    options?: { label: string; description?: string }[]; isOther?: boolean; isSecret?: boolean }[];
}
export interface ConversationSnapshot {
  sessionId: string; projectId: string; generation: string; cursor: number;
  processState: 'running' | 'exited' | 'interrupted';
  turnState: 'idle' | 'running' | 'waiting' | 'completed' | 'interrupted' | 'failed';
  turnId?: string | null; items: AgentItem[]; pending?: AgentItem[]; hasMore: boolean;
}
export type ConversationEvent = Omit<ConversationSnapshot, 'items' | 'pending' | 'hasMore'> & { item?: AgentItem };
