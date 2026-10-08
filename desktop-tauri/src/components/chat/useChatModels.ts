import { useCallback, useEffect, useState } from 'react';
import { chatRequest, type ConversationSnapshot } from '../../ipc/sharedChats';
import type { ModelChoice } from '../../../../mobile/src/conversation/inspection';
import { conversationAgent } from '../../lib/conversationAgent';

const VENDORS: Record<string, string> = { codex: 'OpenAI', claude: 'Anthropic', gemini: 'Google' };

/** Effort words shared with the phone, cheapest first; unknown levels keep their own name. */
const EFFORTS: Record<string, { label: string; hint: string }> = {
  none: { label: 'None', hint: 'Reasoning off' },
  minimal: { label: 'Minimal', hint: 'Quick reasoning' },
  low: { label: 'Low', hint: 'Fastest' },
  medium: { label: 'Medium', hint: 'Balanced' },
  high: { label: 'High', hint: 'Deep reasoning' },
  xhigh: { label: 'X-high', hint: 'Longer, harder problems' },
  max: { label: 'Max', hint: 'Deepest single answer' },
};
export function effortWords(value?: string | null) {
  if (!value) return { label: 'Default', hint: 'The model decides' };
  return EFFORTS[value] ?? { label: value.charAt(0).toUpperCase() + value.slice(1), hint: '' };
}

/**
 * The session's account models and its next-turn model/effort, as one source
 * for the composer pill, the pickers and `/model` `/effort`. Every change goes
 * through the Host's revisioned `conversation.settings`.
 */
export function useChatModels(sessionId: string, snapshot: ConversationSnapshot | null, kind?: string) {
  const agent = conversationAgent(snapshot?.settings?.provider ?? kind);
  const vendor = VENDORS[agent.id] ?? agent.name;
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The list comes from the live provider process, so a chat that was saved or
  // still starting has none yet: load it whenever the chat becomes live.
  const live = snapshot?.processState === 'running';
  useEffect(() => {
    let alive = true;
    setError('');
    if (!live) { setLoading(false); return; }
    setLoading(true);
    void chatRequest<{ models: ModelChoice[] }>('conversation.models', { sessionId })
      .then(value => { if (alive) setModels(value.models ?? []); })
      .catch(cause => { if (alive) setError(String(cause)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sessionId, attempt, live]);
  const current = snapshot?.settings?.model;
  const chosen = models.find(model => modelNames(model).includes(current?.toLowerCase() ?? ''));
  const levels = (chosen?.supportedReasoningEfforts ?? []).map(effort => effort.reasoningEffort);
  // A lone "none" (Gemini, older Claude models) means the provider manages thinking itself.
  const managed = Boolean(chosen) && levels.every(level => level === 'none');
  const ladder = managed ? [] : levels;
  const effort = snapshot?.settings?.effort ?? null;
  const name = chosen?.displayName ?? (!current || current === 'default' ? agent.name : current);
  const apply = useCallback(async (model: string, nextEffort: string | null) => {
    setSaving(true); setError('');
    try {
      await chatRequest('conversation.settings', { sessionId, requestId: crypto.randomUUID(),
        revision: snapshot?.settings?.revision ?? 0, model, effort: nextEffort });
      return true;
    } catch (cause) { setError(String(cause)); return false; }
    finally { setSaving(false); }
  }, [sessionId, snapshot?.settings?.revision]);
  /** A new model keeps the chosen effort when it offers it, else takes its own default. */
  const chooseModel = (model: ModelChoice) => apply(model.model,
    effort && model.supportedReasoningEfforts.some(level => level.reasoningEffort === effort) ? effort : model.defaultReasoningEffort);
  const chooseEffort = (next: string) => chosen ? apply(chosen.model, next) : Promise.resolve(false);
  return { agent, vendor, models, loading, error, saving, chosen, ladder, managed, live, effort, name, apply, chooseModel, chooseEffort,
    retry: () => setAttempt(value => value + 1) };
}
export type ChatModels = ReturnType<typeof useChatModels>;

/** Every name a provider may store for a model: Codex ids, Claude aliases and resolved names. */
function modelNames(model: ModelChoice) {
  const extra = model as ModelChoice & { id?: string; resolvedModel?: string };
  return [model.model, extra.id, extra.resolvedModel].filter((name): name is string => Boolean(name)).map(name => name.toLowerCase());
}
