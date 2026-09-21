import { invoke } from '@tauri-apps/api/core';
export type { AgentItem, ConversationSnapshot } from '../../../mobile/src/state/conversationTypes';
export interface SharedSession { id: string; projectId: string; title: string; status: string; kind?: string; accountId: string }
export const listSharedChats = () => invoke<SharedSession[]>('shared_chat_list');
export interface ConversationLaunchOptions {
  provider?: string;
  model: string | null; reasoningEffort: string | null; permissionMode: 'standard' | 'full';
  workspaceMode: 'safe' | 'shared'; safeSnapshotFingerprint?: string;
}
export const createSharedChat = (projectId: string, accountId: string, requestId: string, title: string, options?: ConversationLaunchOptions) =>
  invoke<SharedSession>('shared_chat_create', { projectId, accountId, requestId, title, options });
export const chatRequest = <T = Record<string, unknown>>(method: string, params: Record<string, unknown>) =>
  invoke<T>('shared_chat_request', { method, params });

export const removeSharedChatProject = (projectId: string) => invoke<void>('shared_chat_remove_project', { projectId });
