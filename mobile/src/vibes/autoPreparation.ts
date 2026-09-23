import type { VibesQuote } from './types';
/** Only the execution tuple is compared; expiring encrypted tokens themselves always differ. */
export function samePreparedExecution(a: VibesQuote, b: VibesQuote): boolean {
  return (
    a.model === b.model &&
    (a.effort ?? null) === (b.effort ?? null) &&
    a.maxCredits === b.maxCredits &&
    JSON.stringify(a.integrations ?? []) === JSON.stringify(b.integrations ?? [])
  );
}
