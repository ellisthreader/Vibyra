import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { preferenceRevision, subscribePreferenceChanges } from './preferenceChanges';
import type { VibesStore } from './VibesStore';
import type { Effort, VibesQuote } from './types';

interface Input {
  store: VibesStore; chatId: string | null; text: string; model: string; effort: Effort | null;
  integrations: string; attachments: string; enabled: boolean; revision: number;
}
interface Quoted { identity: string; value: VibesQuote }
export function quoteIdentity(input: Omit<Input, 'store' | 'enabled' | 'revision'>): string {
  return JSON.stringify([input.chatId, input.text, input.model, input.effort, input.integrations, input.attachments]);
}

/** A quote belongs to one chat and one draft; every retry creates a fresh estimate. */
export function useChatQuote(input: Input) {
  const { store, chatId, text, model, effort, integrations, attachments, enabled, revision } = input;
  const personalRevision = useSyncExternalStore(subscribePreferenceChanges, preferenceRevision, preferenceRevision);
  const identityFor = (id: string | null) => JSON.stringify([quoteIdentity({ ...input, chatId: id }), revision, personalRevision]);
  const identity = identityFor(chatId);
  const [quoted, setQuoted] = useState<Quoted | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const invalidate = () => { ++generation.current; setQuoted(null); setError(null); setRetry(r => r + 1); };
  useEffect(() => {
    const version = ++generation.current; setQuoted(null); setError(null);
    if (!enabled || !text.trim()) return;
    const timer = setTimeout(() => {
      void store.chat(text).then(async id => {
        if (version !== generation.current) return;
        const value = await store.api.quote(id, text.trim(), model, effort,
          integrations ? integrations.split(',') : [], attachments ? attachments.split(',') : []);
        if (version === generation.current && store.state.selected === id) {
          setQuoted({ identity: identityFor(id), value });
        }
      }).catch(e => { if (version === generation.current) setError(e instanceof Error ? e.message : 'The estimate could not be loaded. Please refresh.'); });
    }, 650);
    return () => { clearTimeout(timer); ++generation.current; };
  }, [store, chatId, text, model, effort, integrations, attachments, enabled, revision, personalRevision, retry]);
  useEffect(() => {
    if (!quoted) return;
    const timer = setTimeout(invalidate, Math.max(1000, quoted.value.expiresAt * 1000 - Date.now() - 5000));
    return () => clearTimeout(timer);
  }, [quoted]);
  return { quote: enabled && quoted?.identity === identity ? quoted.value : null, error, invalidate };
}
