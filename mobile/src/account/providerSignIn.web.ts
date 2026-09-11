import type { AccountProvider, ProviderApi } from './accountApi';
import { browserProvider } from './browserProvider';

export async function signInWithProvider(api: ProviderApi, provider: AccountProvider, signal: AbortSignal) {
  if (signal.aborted) return null;
  // Reserve the window during the tap so browsers do not block it after the API request.
  const popup = window.open('about:blank', '_blank', 'popup,width=500,height=700');
  if (!popup) throw new Error('Allow the sign-in pop-up, then try again.');
  popup.opener = null;
  const close = () => popup.close();
  signal.addEventListener('abort', close);
  try {
    return await browserProvider(api, provider, signal, {
      open: url => { popup.location.href = url; }, closed: () => popup.closed, close,
    });
  } finally { signal.removeEventListener('abort', close); }
}
