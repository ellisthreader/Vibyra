import { useSyncExternalStore } from 'react';

// Drafts deliberately stay in memory: unsubmitted source and prompts never enter cloud sync.
// Scope includes the host so identically named sessions cannot share draft text.
const drafts = new Map<string, string>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = () => listeners.forEach(listener => listener());
export function clearDrafts() { drafts.clear(); emit(); }
export function setDraftForScope(scope: string, value: string) {
  if (value) drafts.set(scope, value); else drafts.delete(scope);
  emit();
}
export function useDraft(scope: string) {
  const value = useSyncExternalStore(subscribe, () => drafts.get(scope) ?? '', () => '');
  return [value, (next: string) => setDraftForScope(scope, next)] as const;
}
