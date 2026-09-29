import type { AccountProvider, ProviderApi } from './accountApi';
import { browserFlow } from './browserProvider';
import type { ProfileApi } from './profileApi';
import { finishedAnyway } from './deletionCheck';

type Api = ProviderApi & Pick<ProfileApi, 'deleteWithApple' | 'startDeletion' | 'deletionStatus'>;

/** In a browser every provider confirms in a pop-up, reserved during the tap so it is not blocked. */
export async function deleteWithProvider(
  api: Api,
  provider: AccountProvider,
  token: string,
  signal: AbortSignal,
) {
  if (signal.aborted) return false;
  const popup = window.open('about:blank', '_blank', 'popup,width=500,height=700');
  if (!popup) throw new Error('Allow the pop-up, then try again.');
  popup.opener = null;
  const close = () => popup.close();
  signal.addEventListener('abort', close);
  let flowId: string | null = null;
  try {
    const result = await browserFlow(
      async () => {
        const flow = await api.startDeletion(token, provider);
        flowId = flow.flowId;
        return flow;
      },
      async (id) => (await api.deletionStatus(provider, id)) === 'deleted' || null,
      signal,
      {
        open: (url) => {
          popup.location.href = url;
        },
        closed: () => popup.closed,
        close,
      },
      'This deletion attempt expired. Please try again.',
    );
    return result === true || (await finishedAnyway(api, provider, flowId, signal));
  } finally {
    signal.removeEventListener('abort', close);
  }
}
