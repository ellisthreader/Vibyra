import { requireLease } from './session';
import { conversationScope } from './conversationScope';
import { loadConversation } from './conversationSession';
import type { WorkspaceStore } from './WorkspaceStore';
export type ConversationRead =
  | 'conversation.commands'
  | 'conversation.status'
  | 'conversation.models'
  | 'conversation.usage'
  | 'conversation.artifact';
export function conversationInspect(store: WorkspaceStore) {
  const saving = new Set<string>();
  return {
    uploadConversationAttachment: async (params: Record<string, unknown>) => {
      const lease = requireLease(store);
      const conversation = store.state.conversation;
      if (!conversation || conversation.sessionId !== lease.sessionId)
        throw new Error('Select this conversation first.');
      return store.deps.rpc.request<
        import('../conversation/attachmentUpload').ConversationAttachment
      >('conversation.attachment', { ...params, ...lease, projectId: conversation.projectId });
    },
    conversationRequest: async <T>(
      method: ConversationRead,
      params: Record<string, unknown> = {},
    ): Promise<T> => {
      const scope = conversationScope(store);
      const result = await store.deps.rpc.request<T>(method, {
        ...params,
        sessionId: scope.conversation.sessionId,
      });
      scope.assertCurrent();
      return result;
    },
    setConversationSettings: async (model: string, effort: string, revision: number) => {
      const lease = requireLease(store);
      const scope = conversationScope(store);
      const { sessionId, projectId } = scope.conversation;
      if (saving.has(sessionId)) throw new Error('Your settings are already being applied.');
      saving.add(sessionId);
      try {
        try {
          await store.deps.rpc.request('conversation.settings', {
            ...lease,
            projectId,
            requestId: store.deps.uuid(),
            revision,
            model,
            effort,
          });
        } catch (error) {
          // Conflicts and uncertain replies must reconcile before another choice.
          // Read the current settings; never replay an uncertain mutation.
          if (scope.current()) await loadConversation(store, sessionId).catch(() => {});
          throw error;
        }
        scope.assertCurrent();
        await loadConversation(store, sessionId);
        scope.assertCurrent();
      } finally {
        saving.delete(sessionId);
      }
    },
  };
}
