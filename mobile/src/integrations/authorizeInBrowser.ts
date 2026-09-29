import * as Linking from 'expo-linking';
import * as Browser from 'expo-web-browser';
import type { IntegrationAuthorization, IntegrationsApi } from './types';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Backing out of the card, which is a choice rather than a failure to report. */
export const CANCELLED = 'integrations/cancelled';

/**
 * The sign-in, in the system's own browser sheet. iOS asks first - "Vibyra wants
 * to use github.com to sign in" - because the page opened is the provider's own,
 * not ours; the person signs in there and approves; the provider sends the browser
 * to the server, which stores the connection and sends it on to this app's return
 * link, and the sheet closes itself on that link.
 *
 * The return link carries the outcome, but the server's flow is the record, so it
 * is read either way: a sheet closed by hand after approving still connects. A
 * sheet closed before approving is a cancel, said as one.
 *
 */
export async function authorizeInBrowser(
  api: IntegrationsApi,
  id: string,
  signal?: AbortSignal,
): Promise<IntegrationAuthorization> {
  if (!api.start || !api.flow)
    throw new Error('This version of Vibyra cannot sign in to integrations yet.');
  if (signal?.aborted) throw new Error(CANCELLED);
  // `vibyra://…` in the store app, `exp://…/--/…` inside Expo Go; the server accepts only these.
  const returnUrl = Linking.createURL('integrations/connected');
  // Letting go of the card has to take the sign-in with it, the way account
  // sign-in already does. Without this the server request keeps running and the
  // provider sheet opens over whatever the person moved on to, seconds after
  // they backed out; and a sheet already open is left for them to dismiss.
  let opened = false;
  const close = () => {
    if (opened) Browser.dismissAuthSession();
  };
  signal?.addEventListener('abort', close);
  try {
    const flow = await api.start(id, returnUrl);
    if (signal?.aborted) throw new Error(CANCELLED);
    opened = true;
    const result = await Browser.openAuthSessionAsync(flow.url, returnUrl);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (signal?.aborted) throw new Error(CANCELLED);
      const state = await api.flow(flow.flowId);
      if (state.status === 'connected') return { catalogue: state.catalogue };
      if (state.status !== 'pending')
        throw new Error(state.error ?? 'The sign-in did not finish. Please try again.');
      // Still pending with the sheet closed by hand means nobody approved anything.
      if (result.type !== 'success') throw new Error('You cancelled the sign-in.');
      await wait(600);
    }
    throw new Error('The sign-in did not finish. Please try again.');
  } finally {
    signal?.removeEventListener('abort', close);
  }
}
