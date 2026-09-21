import { browserFlow } from '../account/browserProvider';
import type { IntegrationAuthorization, IntegrationsApi } from './types';

export const CANCELLED = 'integrations/cancelled';

/** Web uses an owner-authenticated status poll, never a token or grant in a URL. */
export async function authorizeInBrowser(api: IntegrationsApi, id: string, signal?: AbortSignal): Promise<IntegrationAuthorization> {
  if (!api.start || !api.flow) throw new Error('This version of Vibyra cannot sign in to integrations yet.');
  const active = signal ?? new AbortController().signal;
  if (active.aborted) throw new Error(CANCELLED);
  // Reserve the popup during the click, before waiting for the server.
  const popup = window.open('about:blank', '_blank', 'popup,width=500,height=700');
  if (!popup) throw new Error('Allow the sign-in pop-up, then try again.');
  popup.opener = null;
  const close = () => popup.close();
  active.addEventListener('abort', close);
  try {
    const result = await browserFlow(async () => {
      // An empty return leaves the callback on the server's completion page.
      const flow = await api.start!(id, '');
      return { flowId: flow.flowId, authUrl: flow.url };
    }, async flowId => {
      const state = await api.flow!(flowId);
      if (state.status === 'connected') return { catalogue: state.catalogue };
      if (state.status !== 'pending') throw new Error(state.error ?? 'The connection did not finish. Please try again.');
      return null;
    }, active, { open: url => { popup.location.href = url; }, closed: () => popup.closed, close },
    'This connection attempt expired. Please try again.');
    if (!result) throw new Error(CANCELLED);
    return result;
  } finally { active.removeEventListener('abort', close); }
}
