import { useEffect, useState, useSyncExternalStore } from 'react';
import { readDraft, writeDraft } from './draftStorage';

// Legacy/sample drafts stay in memory. Structured iOS drafts opt into app-local
// persistence; no unsubmitted source enters account/cloud sync.
const drafts = new Map<string, string>();
const revisions = new Map<string, number>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = () => listeners.forEach(listener => listener());
export function clearDrafts() { drafts.clear(); emit(); }
export function setDraftForScope(scope: string, value: string) {
  revisions.set(scope, (revisions.get(scope) ?? 0) + 1);
  if (value) drafts.set(scope, value); else drafts.delete(scope);
  emit();
}
export function useDraft(scope: string, persist = false) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const revision = revisions.get(scope);
    let savedRevision = revision;
    const save = (force = false) => {
      if (!force && savedRevision === revisions.get(scope)) return;
      savedRevision = revisions.get(scope);
      if (persist) void writeDraft(scope, drafts.get(scope) ?? '').then(() => { if (active) setError(null); })
        .catch(() => { if (active) setError('Your draft is kept here, but could not be saved on this phone.'); });
    };
    const unsubscribe = persist ? subscribe(save) : () => {};
    if (persist && drafts.has(scope)) save(true);
    if (persist && !drafts.has(scope)) void readDraft(scope).then(saved => {
      if (active && revisions.get(scope) === revision && !drafts.has(scope) && saved) setDraftForScope(scope, saved);
    }).catch(() => { if (active) setError('Your saved draft could not be restored.'); });
    return () => { active = false; unsubscribe(); };
  }, [scope, persist]);
  const value = useSyncExternalStore(subscribe, () => drafts.get(scope) ?? '', () => '');
  return [value, (next: string) => {
    setDraftForScope(scope, next);
  }, error] as const;
}
