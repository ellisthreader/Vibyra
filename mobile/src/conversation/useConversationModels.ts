import { useEffect, useState } from 'react';
import { asEffort } from '../ui/effort';
import type { WorkspaceModel } from '../ui/types';
import type { ModelChoice } from './inspection';

export function useConversationModels(workspace: WorkspaceModel) {
  const snapshot = workspace.conversation;
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempt, retry] = useState(0);
  const [runtimeUnavailable, setRuntimeUnavailable] = useState(false);
  const live = snapshot?.processState === 'running';
  const unavailable =
    runtimeUnavailable || (snapshot && !live)
      ? 'This computer chat has ended. Start a phone AI chat to use another model.'
      : '';
  useEffect(() => {
    let alive = true;
    setModels([]);
    setError('');
    setRuntimeUnavailable(false);
    if (!live || workspace.status !== 'connected' || !workspace.actions.conversationRequest) return;
    void workspace.actions
      .conversationRequest<{ models: ModelChoice[] }>('conversation.models')
      .then((value) => {
        if (alive) setModels(value.models);
      })
      .catch((error) => {
        if (!alive) return;
        const message = String(error);
        if (message.includes('Live provider data is unavailable for this saved conversation'))
          setRuntimeUnavailable(true);
        else setError(message);
      });
    return () => {
      alive = false;
    };
  }, [
    snapshot?.sessionId,
    snapshot?.generation,
    live,
    workspace.status,
    workspace.actions,
    attempt,
  ]);
  const model = models.find((model) => model.model === snapshot?.settings?.model);
  const ladder = (model?.supportedReasoningEfforts ?? []).flatMap((item) => {
    const value = asEffort(item.reasoningEffort);
    return value ? [value] : [];
  });
  const apply = async (nextModel: string, effort: string) => {
    if (saving) return false;
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
    try {
      await workspace.actions.setConversationSettings(
        nextModel,
        effort,
        snapshot?.settings?.revision ?? 0,
      );
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    } finally {
      setSaving(false);
    }
  };
  return {
    models,
    model,
    ladder,
    error,
    unavailable,
    saving,
    apply,
    retry: () => retry((value) => value + 1),
  };
}
