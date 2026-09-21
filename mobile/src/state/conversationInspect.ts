import { requireLease } from './session';
import type { WorkspaceStore } from './WorkspaceStore';
export type ConversationRead = 'conversation.commands' | 'conversation.status' | 'conversation.models' | 'conversation.usage' | 'conversation.artifact';
export function conversationInspect(store: WorkspaceStore) {
  return {
    uploadConversationAttachment: async (params: Record<string, unknown>) => {
      const lease = requireLease(store); const conversation = store.state.conversation;
      if (!conversation || conversation.sessionId !== lease.sessionId) throw new Error('Select this conversation first.');
      return store.deps.rpc.request<import('../conversation/attachmentUpload').ConversationAttachment>('conversation.attachment', { ...params, ...lease, projectId: conversation.projectId });
    },
    conversationRequest: async <T>(method: ConversationRead, params: Record<string, unknown> = {}): Promise<T> => {
      const conversation = store.state.conversation; const epoch = store.epoch;
      if (!conversation || store.state.status !== 'connected') throw new Error('Reconnect to inspect this conversation.');
      const result = await store.deps.rpc.request<T>(method, { ...params, sessionId: conversation.sessionId });
      store.assertCurrent(epoch); return result;
    },
    setConversationSettings: async (model: string, effort: string, revision: number) => {
      const lease = requireLease(store); const conversation = store.state.conversation; const epoch = store.epoch;
      if (!conversation || conversation.sessionId !== lease.sessionId) throw new Error('Select this conversation first.');
      await store.deps.rpc.request('conversation.settings', { ...lease, projectId: conversation.projectId,
        requestId: store.deps.uuid(), revision, model, effort });
      store.assertCurrent(epoch); await store.refresh();
    },
  };
}
