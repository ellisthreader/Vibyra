import type { Turn } from './types';

export interface Attachment { id: string; name: string; bytes: number }
export interface Pending { id: string; quote: string; text: string }
export interface ThreadDraft { draft: string; attachments: Attachment[]; pending: Pending | null; model: string; effort: string; recoveryError?: string }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export function restoreThread(raw: string | null): ThreadDraft {
  const empty: ThreadDraft = { draft: '', attachments: [], pending: null, model: 'auto', effort: '' };
  try {
    const data: unknown = JSON.parse(raw ?? '{}');
    if (!record(data)) throw new Error();
    const p = data.pending;
    if (p != null && (!record(p) || typeof p.id !== 'string' || !p.id || typeof p.quote !== 'string' || !p.quote || typeof p.text !== 'string')) throw new Error();
    return { draft: typeof data.draft === 'string' ? data.draft : '', pending: (p as unknown as Pending) ?? null,
      attachments: Array.isArray(data.attachments) ? data.attachments.filter((a): a is Attachment => record(a) && typeof a.id === 'string' && typeof a.name === 'string' && typeof a.bytes === 'number') : [],
      model: typeof data.model === 'string' ? data.model : 'auto', effort: typeof data.effort === 'string' ? data.effort : '' };
  } catch { return { ...empty, recoveryError: 'The saved send could not be restored. Your saved data has been kept. Reopen the app before sending again.' }; }
}
export function saveThread(key: string, value: ThreadDraft, storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(key, JSON.stringify(value));
}
export function confirmedTurn(value: { turn?: Turn }, chatId: string, request: Pending): Turn {
  const turn = value?.turn;
  if (!turn || turn.id !== request.id || turn.chatId !== chatId || turn.prompt !== request.text) {
    throw new Error('The send receipt does not match this conversation. Refresh to check the outcome.');
  }
  return turn;
}
export function validateTurns(value: { turns?: Turn[] }, chatId: string): Turn[] {
  if (!Array.isArray(value?.turns) || value.turns.some(t => !t || t.chatId !== chatId || typeof t.id !== 'string' || typeof t.prompt !== 'string')) {
    throw new Error('The service returned an invalid conversation. Try refreshing.');
  }
  return value.turns;
}
