import { useEffect, useRef, useState } from 'react';
import type { Personalization, PersonalizationState, TextField } from '../personalization';

/**
 * One box that saves when it is left: Done, a tap elsewhere, or closing the sheet.
 * What is typed stays on screen until the server holds it, "Saved" appears only once
 * it does, and a refused save keeps the words so nothing typed is lost.
 */
export function useTextDraft(
  store: Personalization | null,
  state: PersonalizationState,
  field: TextField,
) {
  // What is being typed, or null while the box shows what the server holds.
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = useRef<string | null>(null);
  pending.current = draft;
  useEffect(() => {
    if (!state.savedAt || state.savedField !== field) return;
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(timer);
  }, [state.savedAt, state.savedField, field]);
  // Closing the sheet mid-sentence is leaving the box too; the words are not dropped.
  useEffect(
    () => () => {
      if (pending.current !== null) void store?.saveText(field, pending.current);
    },
    [store, field],
  );
  return {
    value: draft ?? state.preferences?.[field] ?? '',
    focused,
    saving: state.busy === field,
    saved: saved && !focused,
    change: (text: string) => {
      setDraft(text);
      setSaved(false);
      store?.clearError();
    },
    focus: () => setFocused(true),
    commit: async () => {
      setFocused(false);
      if (draft !== null && store && (await store.saveText(field, draft))) setDraft(null);
    },
  };
}
export type TextDraft = ReturnType<typeof useTextDraft>;
