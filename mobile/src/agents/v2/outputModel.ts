export interface AgentOutput {
  id: string; agentId: string; runId: string; revision: number; kind: 'text' | 'table' | 'checklist'; title: string;
  content: { text?: string; columns?: string[]; rows?: string[][]; items?: { id: string; text: string; checked: boolean }[] };
  sources: { runId: string; actionIds: string[] }; createdAt: string; updatedAt: string;
}
export interface DraftAttachment { id: string; name: string; mimeType: string; size: number; sha256?: string }
export interface DraftSelection { connectionId?: string; attachmentIds?: string[] }
export interface AgentDraft {
  id: string; runId: string; agentId: string; revision: number; state: string; account: string;
  connectionId?: string; senders?: { connectionId: string; account: string }[]; attachments?: DraftAttachment[];
  editableFields: string[]; arguments: { to: string; subject: string; body: string; attachments?: DraftAttachment[] }; fingerprint: string; expiresAt: string;
}
export interface OutputExport { filename: string; contentType: string; content: string }
