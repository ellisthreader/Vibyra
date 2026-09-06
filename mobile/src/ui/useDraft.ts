import { useEffect, useRef, useState } from 'react';

// Drafts deliberately stay in memory: unsubmitted source and prompts never enter cloud sync.
// Scope includes the host so identically named sessions cannot share draft text.
const drafts = new Map<string, string>();
export function clearDrafts() { drafts.clear(); }
export function useDraft(scope: string) {
  const [value, setValue] = useState(() => drafts.get(scope) ?? '');
  const activeScope = useRef(scope);
  useEffect(() => {
    activeScope.current = scope;
    setValue(drafts.get(scope) ?? '');
  }, [scope]);
  const update = (next: string) => {
    const key = activeScope.current;
    if (next) drafts.set(key, next); else drafts.delete(key);
    setValue(next);
  };
  return [value, update] as const;
}
