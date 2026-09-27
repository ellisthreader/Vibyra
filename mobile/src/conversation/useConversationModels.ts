import { useEffect, useRef, useState } from 'react';
import { asEffort } from '../ui/effort';
import type { WorkspaceModel } from '../ui/types';
import type { ModelChoice } from './inspection';

export function useConversationModels(workspace: WorkspaceModel) {
  const snapshot = workspace.conversation;
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempt, retry] = useState(0);
  const [runtimeUnavailable, setRuntimeUnavailable] = useState(false);
  const scope = `${workspace.host?.id}:${snapshot?.sessionId}:${snapshot?.generation}:${snapshot?.processState}:${workspace.status}`;
  const owner = useRef(scope);
  owner.current = scope;
  const pending = useRef<object | null>(null);
  const actions = useRef(workspace.actions);
  actions.current = workspace.actions;
  const live = snapshot?.processState === 'running';
  const unavailable =
    runtimeUnavailable || (snapshot && !live)
      ? 'This computer chat has ended. Start a phone AI chat to use another model.'
      : workspace.status !== 'connected'
        ? 'Reconnect to your Mac to load account models.'
        : !snapshot
          ? 'Wait for this conversation to load.'
          : '';
  useEffect(() => {
    let alive = true;
    setModels([]);
    setError('');
    setRuntimeUnavailable(false);
    setSaving(false);
    pending.current = null;
    setLoading(false);
    if (!live || workspace.status !== 'connected' || !actions.current.conversationRequest) return;
    setLoading(true);
    void actions.current
      .conversationRequest<{ models: ModelChoice[] }>('conversation.models')
      .then((value) => {
        if (!Array.isArray(value.models))
          throw new Error('The computer returned an invalid model list.');
        if (alive) setModels(value.models);
      })
      .catch((error) => {
        if (!alive) return;
        const message = String(error);
        if (message.includes('Live provider data is unavailable for this saved conversation'))
          setRuntimeUnavailable(true);
        else setError(message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [scope, live, workspace.status, attempt]);
  const model = models.find((model) => model.model === snapshot?.settings?.model);
  const ladder = (model?.supportedReasoningEfforts ?? []).flatMap((item) => {
    const value = asEffort(item.reasoningEffort);
    return value ? [value] : [];
  });
  const apply = async (nextModel: string, effort: string) => {
    if (pending.current || owner.current !== scope) return false;
    if (!live || unavailable) {
      setError(unavailable || 'Wait for the conversation to connect.');
      return false;
    }
    if (workspace.control !== 'ready' || !workspace.actions.setConversationSettings) {
      setError('Take control to change this session’s settings.');
      return false;
    }
    setSaving(true);
    setError('');
    const request = {};
    pending.current = request;
    const current = () => owner.current === scope && pending.current === request;
    try {
      await workspace.actions.setConversationSettings(
        nextModel,
        effort,
        snapshot?.settings?.revision ?? 0,
      );
      return current();
    } catch (error) {
      if (current()) setError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      if (current()) {
        pending.current = null;
        setSaving(false);
      }
    }
  };
  return {
    models,
    loading,
    model,
    ladder,
    error,
    unavailable,
    saving,
    apply,
    retry: () => retry((value) => value + 1),
  };
}
