import * as Linking from 'expo-linking';
import * as Browser from 'expo-web-browser';
import type { IntegrationCatalogue, IntegrationsApi } from './types';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
 */
export async function authorizeInBrowser(api: IntegrationsApi, id: string): Promise<IntegrationCatalogue> {
  if (!api.start || !api.flow) throw new Error('This version of Vibyra cannot sign in to integrations yet.');
  // `vibyra://…` in the store app, `exp://…/--/…` inside Expo Go; the server accepts only these.
  const returnUrl = Linking.createURL('integrations/connected');
  const flow = await api.start(id, returnUrl);
  const result = await Browser.openAuthSessionAsync(flow.url, returnUrl);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const state = await api.flow(flow.flowId);
    if (state.status === 'connected') return state.catalogue;
    if (state.status !== 'pending') throw new Error(state.error ?? 'The sign-in did not finish. Please try again.');
    // Still pending with the sheet closed by hand means nobody approved anything.
    if (result.type !== 'success') throw new Error('You cancelled the sign-in.');
    await wait(600);
  }
  throw new Error('The sign-in did not finish. Please try again.');
}
