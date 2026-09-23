import type { AccountProvider } from './accountApi';
import type { ProfileApi } from './profileApi';

/** The provider's page never sends the browser back, so a person who closes it the
 *  moment it says "deleted" beats the next poll. One more look settles which it was. */
export async function finishedAnyway(
  api: Pick<ProfileApi, 'deletionStatus'>,
  provider: AccountProvider,
  flowId: string | null,
  signal: AbortSignal,
) {
  if (!flowId || signal.aborted) return false;
  try {
    return (await api.deletionStatus(provider, flowId)) === 'deleted';
  } catch {
    return false;
  }
}
