export interface AgentItem {
  id: string;
  turnId: string;
  cursor?: number;
  order?: number;
  kind: 'message' | 'activity' | 'permission' | 'question' | 'result';
  role?: 'user' | 'assistant';
  text?: string;
  title?: string;
  detail?: string;
  scope?: string;
  truncated?: boolean;
  attachments?: { id: string; name: string; mime: string; hash: string }[];
  category?: string;
  durationMs?: number | null;
  command?: string;
  cwd?: string;
  startedAt?: string;
  updatedAt?: string;
  provenance?: string;
  exitCode?: number | null;
  actions?: { type: string; path?: string; query?: string }[];
  artifact?: { id: string; hash: string; bytes: number; truncated: boolean };
  hasDetail?: boolean;
  changes?: {
    path: string;
    kind: { type: 'add' | 'delete' | 'update'; move_path?: string | null };
    added: number;
    removed: number;
  }[];
  allowLabel?: string;
  choices?: string[];
  persistentAvailable?: boolean;
  decisionScope?: string;
  status: string;
  requestId?: string;
  actionVersion?: string;
  questions?: {
    id: string;
    header?: string;
    question: string;
    options?: { label: string; description?: string }[];
    isOther?: boolean;
    isSecret?: boolean;
  }[];
}
export interface ConversationSnapshot {
  sessionId: string;
  projectId: string;
  generation: string;
  cursor: number;
  processState: 'running' | 'exited' | 'interrupted';
  turnState: 'idle' | 'running' | 'waiting' | 'completed' | 'interrupted' | 'failed';
  turnId?: string | null;
  items: AgentItem[];
  pending?: AgentItem[];
  hasMore: boolean;
  workingDirectory?: string | null;
  settings?: {
    provider?: string;
    model: string;
    effort: string | null;
    approvalPolicy: unknown;
    sandbox?: unknown;
    revision: number;
    appliesTo: string;
  };
  usage?: Record<string, unknown>;
}
export type ConversationEvent = Omit<ConversationSnapshot, 'items' | 'pending' | 'hasMore'> & {
  item?: AgentItem;
};
