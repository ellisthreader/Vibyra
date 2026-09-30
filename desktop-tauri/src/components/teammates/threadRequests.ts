import { confirmedTurn, type Pending } from './threadStorage.ts';
import type { Turn } from './types';
type Request = <T>(path: string, body?: unknown) => Promise<T>;
export async function submitThread(api: Request, chatId: string, pending: Pending, rejected: () => void) {
  let result: { turn: Turn };
  try { result = await api('vibes/turns', { id: pending.id, quote: pending.quote }); }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // Only a confirmed absence releases the original request. An interrupted lookup
    // preserves its exact ID and quote, including balance/rate-limit refusals.
    if (!/^4\d\d:/.test(detail)) throw error;
    try { result = await api(`vibes/turns/${pending.id}`); }
    catch (lookup) {
      if (String(lookup instanceof Error ? lookup.message : lookup).startsWith('404:')) rejected();
      throw error;
    }
  }
  return confirmedTurn(result, chatId, pending);
}
